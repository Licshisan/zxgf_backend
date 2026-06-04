import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  EventType,
  type AGUIEvent,
  type Message,
  type RunAgentInput,
} from '@ag-ui/core';
import type { AuthUser } from '../../common/types/auth-user.type';
import {
  type LlmProviderEvent,
  type LlmProviderOptions,
} from '../../shared/llm/llm-provider.interface';
import { LlmProviderRegistry } from '../../shared/llm/llm-provider.registry';
import { ProfileService } from '../profile/profile.service';
import type { UserProfileData } from '../profile/types/user-profile.type';
import { RagService } from '../rag/rag.service';
import { getProviderOptions, messageContentToText } from './adapters/chat.adapter';

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

    const options = getProviderOptions(input);
    const threadId = input.threadId || '123';
    const runId = input.runId || 'run_id';
    const messageId = `msg_${randomUUID()}`;
    let messages = input.messages || [];
    let profile: UserProfileData | null = null;
    const originalMessages = messages;
    const userText = this.getLastUserMessageText(originalMessages);
    let assistantText = '';

    yield {
      type: EventType.RUN_STARTED,
      threadId,
      runId,
    };

    if (options.profile?.enabled !== false) {
      profile = await this.getUserProfileForChat(user.sub);
      messages = this.applyProfileContext(messages, profile);
    }

    const ragContextStream = this.applyRagContext(messages, options, signal);
    while (true) {
      const next = await ragContextStream.next();
      if (next.done) {
        messages = next.value;
        break;
      }
      yield next.value;
    }

    if (signal.aborted) return;

    const provider = this.providerRegistry.getProvider(options.provider);
    const events = provider.streamChat({
      messages,
      options,
      signal,
    });

    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      timestamp: Date.now(),
    };

    for await (const event of events) {
      if (signal.aborted) return;
      if (!event.delta) continue;

      if (event.type === 'text-delta') {
        assistantText += event.delta;
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: event.delta,
          timestamp: Date.now(),
        };
      }
    }

    if (signal.aborted) return;

    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      timestamp: Date.now(),
    };

    yield {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      outcome: {
        type: 'success',
      },
      timestamp: Date.now(),
    };

    if (
      options.profile?.enabled !== false &&
      options.profile?.update !== false &&
      profile &&
      userText &&
      assistantText
    ) {
      void this.updateProfileFromConversation({
        userId: user.sub,
        profile,
        userText,
        assistantText,
        options,
      });
    }
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

  private applyProfileContext(
    messages: Message[],
    profile: UserProfileData | null,
  ): Message[] {
    const content = this.formatProfileContext(profile);
    if (!content) {
      return messages;
    }

    return [
      {
        id: `profile_${randomUUID()}`,
        role: 'system',
        content,
      } as Message,
      ...messages,
    ];
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

  private async updateProfileFromConversation(input: {
    userId: string;
    profile: UserProfileData;
    userText: string;
    assistantText: string;
    options: LlmProviderOptions;
  }): Promise<void> {
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

  private async *applyRagContext(
    messages: Message[],
    options: LlmProviderOptions,
    signal: AbortSignal,
  ): AsyncGenerator<AGUIEvent, Message[]> {
    if (options.rag?.enabled === false || signal.aborted) {
      return messages;
    }

    const query = this.getLastUserMessageText(messages);
    if (!query) {
      return messages;
    }

    const toolCallId = `call_${randomUUID()}`;
    const toolMessageId = `tool_${randomUUID()}`;
    const searchInput = {
      query,
      topK: options.rag?.topK ?? 5,
      minScore: options.rag?.minScore ?? 0,
      sourceId: options.rag?.sourceId,
      filters: options.rag?.filters,
    };

    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolCallName: 'rag_search',
      timestamp: Date.now(),
    };
    yield {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId,
      delta: JSON.stringify(searchInput),
      timestamp: Date.now(),
    };
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      timestamp: Date.now(),
    };

    try {
      const searchResult = await this.ragService.search(searchInput);
      const toolResult = {
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
      };

      yield {
        type: EventType.TOOL_CALL_RESULT,
        messageId: toolMessageId,
        toolCallId,
        content: JSON.stringify(toolResult),
        role: 'tool',
        timestamp: Date.now(),
      };

      if (searchResult.results.length === 0) {
        return messages;
      }

      return [
        {
          id: `rag_${randomUUID()}`,
          role: 'system',
          content: this.formatRagContext(searchResult.results),
        } as Message,
        ...messages,
      ];
    } catch (err) {
      yield {
        type: EventType.TOOL_CALL_RESULT,
        messageId: toolMessageId,
        toolCallId,
        content: JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : 'RAG search failed',
        }),
        role: 'tool',
        timestamp: Date.now(),
      };

      return messages;
    }
  }

  private getLastUserMessageText(messages: Message[]): string {
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'user');

    return lastUserMessage ? messageContentToText(lastUserMessage.content) : '';
  }

  private formatRagContext(
    results: Awaited<ReturnType<RagService['search']>>['results'],
  ): string {
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
