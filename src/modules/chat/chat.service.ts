import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
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

type RagSearchResults = Awaited<ReturnType<RagService['search']>>['results'];

interface ProfileUpdateInput {
  userId: string;
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
  ) {}

  async *runAgent(
    input: Partial<RunAgentInput>,
    signal: AbortSignal,
    user: AuthUser,
  ): AsyncGenerator<AGUIEvent> {
    if (signal.aborted) return;

    const context = createRunContext(input, user);

    yield createRunStartedEvent(context);

    await this.applyProfileIfEnabled(context);
    context.messages = yield* this.applyRagIfEnabled(context, signal);

    if (signal.aborted) return;

    context.assistantText = yield* this.streamAssistantResponse(
      context,
      signal,
    );

    if (signal.aborted) return;

    yield createRunFinishedEvent(context);
    this.scheduleProfileUpdate(context);
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

    yield createToolCallStartEvent(toolCallId, 'rag_search');
    yield createToolCallArgsEvent(toolCallId, searchInput);
    yield createToolCallEndEvent(toolCallId);

    try {
      const searchResult = await this.ragService.search(searchInput);

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

  private scheduleProfileUpdate(context: ChatRunContext): void {
    if (
      context.options.profile?.enabled === false ||
      context.options.profile?.update === false ||
      !context.profile ||
      !context.userText ||
      !context.assistantText
    ) {
      return;
    }

    void this.updateProfileFromConversation({
      userId: context.userId,
      profile: context.profile,
      userText: context.userText,
      assistantText: context.assistantText,
      options: context.options,
    });
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
    try {
      const result = await this.profileService.updateProfile(input.userId, {
        conversation: {
          user: input.userText,
          assistant: input.assistantText,
        },
        currentProfile: input.profile,
        options: input.options,
      });
      this.logger.debug(
        `Recognized profile patch: ${JSON.stringify(result.patch)}`,
      );
    } catch (err) {
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
