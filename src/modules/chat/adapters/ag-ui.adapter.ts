import { randomUUID } from 'node:crypto';
import {
  EventType,
  type AGUIEvent,
  type Message,
  type RunAgentInput,
} from '@ag-ui/core';
import type { ChatProviderEvent } from '../providers/chat-provider.interface';

export async function* toAguiStream(
  input: Partial<RunAgentInput>,
  events: AsyncIterable<ChatProviderEvent>,
  signal: AbortSignal,
): AsyncGenerator<AGUIEvent> {
  if (signal.aborted) return;

  const threadId = input.threadId || '123';
  const runId = input.runId || 'run_id';
  const messageId = `msg_${randomUUID()}`;

  yield {
    type: EventType.RUN_STARTED,
    threadId,
    runId,
  };

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

export function messageContentToText(content: Message['content']): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === 'text' ? part.text : `[${part.type}]`))
      .join(' ')
      .trim();
  }

  return '';
}
