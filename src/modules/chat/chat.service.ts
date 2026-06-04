import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  EventType,
  type AGUIEvent,
  type Message,
  type RunAgentInput,
} from '@ag-ui/core';
import { RagService } from '../rag/rag.service';
import { getProviderOptions, messageContentToText } from './adapters/chat.adapter';
import {
  type ChatProviderEvent,
  type ChatProviderOptions,
} from './providers/chat-provider.interface';
import { ChatProviderRegistry } from './providers/chat-provider.registry';

@Injectable()
export class ChatService {
  constructor(
    private readonly providerRegistry: ChatProviderRegistry,
    private readonly ragService: RagService,
  ) {}

  async *runAgent(
    input: Partial<RunAgentInput>,
    signal: AbortSignal,
  ): AsyncGenerator<AGUIEvent> {
    if (signal.aborted) return;

    const options = getProviderOptions(input);
    const threadId = input.threadId || '123';
    const runId = input.runId || 'run_id';
    const messageId = `msg_${randomUUID()}`;
    let messages = input.messages || [];

    yield {
      type: EventType.RUN_STARTED,
      threadId,
      runId,
    };

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
  }

  private async *applyRagContext(
    messages: Message[],
    options: ChatProviderOptions,
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

export type { ChatProviderEvent };
