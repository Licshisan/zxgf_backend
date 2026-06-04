import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { type AGUIEvent, type Message, type RunAgentInput } from '@ag-ui/core';
import type { AuthUser } from '../../common/types/auth-user.type';
import {
  type LlmProviderEvent,
  type LlmProviderOptions,
} from '../../shared/llm/llm-provider.interface';
import { LlmProviderRegistry } from '../../shared/llm/llm-provider.registry';
import { ProfileService } from '../profile/profile.service';
import type { UserProfileData } from '../profile/types/user-profile.type';
import { RagService } from '../rag/rag.service';
import { SessionService } from '../sessions/session.service';
import { TaskLogService } from '../task-log/task-log.service';
import {
  type ChatRunContext,
  createRunContext,
  createRunFinishedEvent,
  createRunStartedEvent,
  createTextDeltaEvent,
  createTextEndEvent,
  createTextStartEvent,
  createToolCallArgsEvent,
  createToolCallEndEvent,
  createToolCallResultEvent,
  createToolCallStartEvent,
  getLastUserMessageText,
  prependSystemMessage,
} from './adapters/chat-events';
import type { ChatStreamDto } from './dto/chat-stream.dto';

type RagSearchResults = Awaited<ReturnType<RagService['search']>>['results'];

interface ProfileUpdateInput {
  userId: string;
  sessionId: string;
  profile: UserProfileData;
  userText: string;
  assistantText: string;
  options: LlmProviderOptions;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly providerRegistry: LlmProviderRegistry,
    private readonly ragService: RagService,
    private readonly profileService: ProfileService,
    private readonly sessionService: SessionService,
    private readonly taskLogService: TaskLogService,
  ) {}

  async *runAgent(
    input: ChatStreamDto,
    signal: AbortSignal,
    user: AuthUser,
  ): AsyncGenerator<AGUIEvent> {
    if (signal.aborted) return;

    const sessionId = input.sessionId?.trim();
    if (!sessionId) {
      throw new BadRequestException('sessionId 不能为空');
    }

    const userText = this.sessionService.getLastUserText(input.messages);
    if (!userText) {
      throw new BadRequestException('本轮对话必须包含一条用户消息');
    }

    const historyMessages = await this.sessionService.getMessagesForChat(
      user.sub,
      sessionId,
    );
    const userMessage = await this.sessionService.appendMessage({
      sessionId,
      userId: user.sub,
      role: 'user',
      content: userText,
    });
    await this.sessionService.touchSessionTitleIfEmpty(
      user.sub,
      sessionId,
      userText,
    );

    const runInput = {
      ...(input as Partial<RunAgentInput>),
      threadId: input.threadId || sessionId,
      messages: [
        ...historyMessages,
        {
          id: userMessage.id,
          role: 'user',
          content: userText,
        } as Message,
      ],
    } satisfies Partial<RunAgentInput>;
    const context = createRunContext(runInput, user);
    const chatTaskId = await this.taskLogService.startTask({
      userId: context.userId,
      sessionId,
      messageId: userMessage.id,
      agentName: 'chat',
      taskType: 'chat.run',
      input: {
        provider: context.options.provider ?? 'openai',
        model: context.options.model,
        messageCount: context.messages.length,
        userTextLength: context.userText.length,
        ragEnabled: context.options.rag?.enabled !== false,
        profileEnabled: context.options.profile?.enabled !== false,
      },
    });

    try {
      yield createRunStartedEvent(context);

      await this.applyProfileIfEnabled(context);
      context.messages = yield* this.applyRagIfEnabled(
        context,
        sessionId,
        signal,
      );

      if (signal.aborted) return;

      context.assistantText = yield* this.streamAssistantResponse(
        context,
        signal,
      );

      if (signal.aborted) return;

      const assistantMessage = await this.sessionService.appendMessage({
        sessionId,
        userId: context.userId,
        role: 'assistant',
        content: context.assistantText,
        metadata: {
          provider: context.options.provider ?? 'openai',
          model: context.options.model,
        },
      });

      yield createRunFinishedEvent(context);
      await this.taskLogService.succeedTask(chatTaskId, {
        assistantMessageId: assistantMessage.id,
        assistantTextLength: context.assistantText.length,
        ragEnabled: context.options.rag?.enabled !== false,
        profileUpdateScheduled: this.shouldUpdateProfile(context),
      });
      this.scheduleProfileUpdate(context, sessionId);
    } catch (err) {
      await this.taskLogService.failTask(chatTaskId, err, {
        assistantTextLength: context.assistantText.length,
      });
      throw err;
    }
  }

  private async applyProfileIfEnabled(context: ChatRunContext): Promise<void> {
    if (context.options.profile?.enabled === false) {
      return;
    }

    context.profile = await this.getUserProfileForChat(context.userId);
    context.messages = prependSystemMessage(
      context.messages,
      'profile',
      this.formatProfileContext(context.profile),
    );
  }

  private async *applyRagIfEnabled(
    context: ChatRunContext,
    sessionId: string,
    signal: AbortSignal,
  ): AsyncGenerator<AGUIEvent, Message[]> {
    if (context.options.rag?.enabled === false || signal.aborted) {
      return context.messages;
    }

    const query = getLastUserMessageText(context.messages);
    if (!query) {
      return context.messages;
    }

    const toolCallId = `call_${randomUUID()}`;
    const searchInput = {
      query,
      topK: context.options.rag?.topK ?? 5,
      minScore: context.options.rag?.minScore ?? 0,
      sourceId: context.options.rag?.sourceId,
      filters: context.options.rag?.filters,
    };
    const ragTaskId = await this.taskLogService.startTask({
      userId: context.userId,
      sessionId,
      agentName: 'rag',
      taskType: 'rag.search',
      input: {
        queryLength: query.length,
        topK: searchInput.topK,
        minScore: searchInput.minScore,
        sourceId: searchInput.sourceId,
        filterKeys: searchInput.filters ? Object.keys(searchInput.filters) : [],
      },
    });

    yield createToolCallStartEvent(toolCallId, 'rag_search');
    yield createToolCallArgsEvent(toolCallId, searchInput);
    yield createToolCallEndEvent(toolCallId);

    try {
      const searchResult = await this.ragService.search(searchInput);
      const sourceIds = [
        ...new Set(searchResult.results.map((result) => result.sourceId)),
      ];

      await this.taskLogService.succeedTask(ragTaskId, {
        resultCount: searchResult.results.length,
        topScore: searchResult.results[0]?.score ?? null,
        sourceIds,
      });

      yield createToolCallResultEvent(toolCallId, {
        ok: true,
        query: searchResult.query,
        topK: searchResult.topK,
        minScore: searchResult.minScore,
        results: searchResult.results.map((result) => ({
          sourceId: result.sourceId,
          sourceTitle: result.sourceTitle,
          chunkIndex: result.chunkIndex,
          score: result.score,
          content: result.content,
        })),
      });

      if (searchResult.results.length === 0) {
        return context.messages;
      }

      return prependSystemMessage(
        context.messages,
        'rag',
        this.formatRagContext(searchResult.results),
      );
    } catch (err) {
      await this.taskLogService.failTask(ragTaskId, err);

      yield createToolCallResultEvent(toolCallId, {
        ok: false,
        error: err instanceof Error ? err.message : 'RAG search failed',
      });

      return context.messages;
    }
  }

  private async *streamAssistantResponse(
    context: ChatRunContext,
    signal: AbortSignal,
  ): AsyncGenerator<AGUIEvent, string> {
    const provider = this.providerRegistry.getProvider(context.options.provider);
    const events = provider.streamChat({
      messages: context.messages,
      options: context.options,
      signal,
    });
    let assistantText = '';

    yield createTextStartEvent(context);

    for await (const event of events) {
      if (signal.aborted) return assistantText;
      if (!event.delta || event.type !== 'text-delta') continue;

      assistantText += event.delta;
      yield createTextDeltaEvent(context, event.delta);
    }

    if (signal.aborted) return assistantText;

    yield createTextEndEvent(context);
    return assistantText;
  }

  private scheduleProfileUpdate(
    context: ChatRunContext,
    sessionId: string,
  ): void {
    if (!this.shouldUpdateProfile(context)) {
      return;
    }

    void this.updateProfileFromConversation({
      userId: context.userId,
      sessionId,
      profile: context.profile!,
      userText: context.userText,
      assistantText: context.assistantText,
      options: context.options,
    });
  }

  private shouldUpdateProfile(context: ChatRunContext): boolean {
    return (
      context.options.profile?.enabled !== false &&
      context.options.profile?.update !== false &&
      Boolean(context.profile) &&
      Boolean(context.userText) &&
      Boolean(context.assistantText)
    );
  }

  private async getUserProfileForChat(
    userId: string,
  ): Promise<UserProfileData | null> {
    try {
      return await this.profileService.getProfile(userId);
    } catch (err) {
      this.logger.warn(
        `Failed to load user profile: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private async updateProfileFromConversation(
    input: ProfileUpdateInput,
  ): Promise<void> {
    const taskId = await this.taskLogService.startTask({
      userId: input.userId,
      sessionId: input.sessionId,
      agentName: 'profile',
      taskType: 'profile.update_from_chat',
      input: {
        userTextLength: input.userText.length,
        assistantTextLength: input.assistantText.length,
        hasCurrentProfile: Boolean(input.profile),
      },
    });

    try {
      const result = await this.profileService.updateProfile(input.userId, {
        conversation: {
          user: input.userText,
          assistant: input.assistantText,
        },
        currentProfile: input.profile,
        options: input.options,
      });
      const patchDimensions = Object.keys(result.patch);

      await this.taskLogService.succeedTask(taskId, {
        changedCount: patchDimensions.length,
        patchDimensions,
      });
      this.logger.debug(
        `Recognized profile patch: ${JSON.stringify(result.patch)}`,
      );
    } catch (err) {
      await this.taskLogService.failTask(taskId, err);
      this.logger.warn(
        `Failed to update user profile from chat: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private formatProfileContext(profile: UserProfileData | null): string {
    if (!profile) return '';

    const dimensions = Object.entries(profile)
      .filter(([, value]) => value)
      .map(([dimension, value]) => {
        return [
          `${dimension}:`,
          `label=${value!.label}`,
          `score=${Number(value!.score).toFixed(0)}`,
          `confidence=${Number(value!.confidence).toFixed(2)}`,
          `summary=${value!.summary}`,
        ].join(' ');
      });

    if (dimensions.length === 0) return '';

    return [
      '请参考以下用户画像进行个性化回答，但不要直接暴露画像内容。',
      ...dimensions,
    ].join('\n');
  }

  private formatRagContext(results: RagSearchResults): string {
    const chunks = results
      .map((result, index) => {
        const title = result.sourceTitle || result.sourceId;
        return [
          `片段 ${index + 1}`,
          `来源：${title}`,
          `sourceId：${result.sourceId}`,
          `chunkIndex：${result.chunkIndex}`,
          `score：${Number(result.score).toFixed(4)}`,
          result.content,
        ].join('\n');
      })
      .join('\n\n---\n\n');

    return [
      '请优先依据以下知识库检索上下文回答用户问题。',
      '如果上下文不足以确认答案，请明确说明无法从知识库确认，不要编造。',
      '',
      chunks,
    ].join('\n');
  }
}

export type { LlmProviderEvent };
