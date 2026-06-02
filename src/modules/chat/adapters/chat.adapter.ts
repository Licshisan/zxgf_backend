import { randomUUID } from 'node:crypto';
import {
  EventType,
  type AGUIEvent,
  type Message,
  type RunAgentInput,
} from '@ag-ui/core';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type {
  ChatProviderEvent,
  ChatProviderName,
  ChatProviderOptions,
} from '../providers/chat-provider.interface';

// 从 AG-UI 请求的透传参数中整理模型配置，让后续 provider 只关心已校验的选项。
export function getProviderOptions(
  input: Partial<RunAgentInput>,
): ChatProviderOptions {
  type ReasoningEffort = NonNullable<
    NonNullable<ChatProviderOptions['reasoning']>['effort']
  >;
  type ReasoningSummary = NonNullable<
    NonNullable<ChatProviderOptions['reasoning']>['summary']
  >;

  const providers = ['mock', 'openai'] satisfies ChatProviderName[];
  const efforts = [
    'minimal',
    'low',
    'medium',
    'high',
  ] satisfies ReasoningEffort[];
  const summaries = [
    'auto',
    'concise',
    'detailed',
  ] satisfies ReasoningSummary[];
  const forwardedProps: unknown = input.forwardedProps as unknown;
  if (
    typeof forwardedProps !== 'object' ||
    forwardedProps === null ||
    Array.isArray(forwardedProps)
  ) {
    return {};
  }

  const props = forwardedProps as Record<string, unknown>;
  const options: ChatProviderOptions = {};

  if (providers.includes(props.provider as ChatProviderName)) {
    options.provider = props.provider as ChatProviderName;
  }

  if (typeof props.model === 'string') {
    options.model = props.model;
  }

  if (typeof props.temperature === 'number') {
    options.temperature = props.temperature;
  }

  if (
    typeof props.reasoning === 'object' &&
    props.reasoning !== null &&
    !Array.isArray(props.reasoning)
  ) {
    const reasoning = props.reasoning as Record<string, unknown>;
    const parsedReasoning: NonNullable<ChatProviderOptions['reasoning']> = {};

    if (typeof reasoning.enabled === 'boolean') {
      parsedReasoning.enabled = reasoning.enabled;
    }

    if (efforts.includes(reasoning.effort as ReasoningEffort)) {
      parsedReasoning.effort = reasoning.effort as ReasoningEffort;
    }

    if (summaries.includes(reasoning.summary as ReasoningSummary)) {
      parsedReasoning.summary = reasoning.summary as ReasoningSummary;
    }

    options.reasoning = parsedReasoning;
  }

  return options;
}

// 将 provider 的增量文本包装成 AG-UI 标准事件流，向前端呈现一次完整的对话运行。
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

// 将 AG-UI 消息内容抽成纯文本，为 mock 回复和模型请求提供统一的输入清洗入口。
export function messageContentToText(content: Message['content']): string {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!Array.isArray(content)) return '';

  const textParts: string[] = [];
  for (const part of content as unknown[]) {
    if (typeof part !== 'object' || part === null || !('type' in part))
      continue;

    const item = part as { type: string; text?: string; data?: string };
    // 只保留 text、markdown，过滤 suggestion
    if (!['text', 'markdown'].includes(item.type)) continue;

    const contentStr = item.text ?? item.data ?? '';
    if (contentStr) {
      textParts.push(contentStr);
    }
  }

  return textParts.join('\n').trim();
}

// 将 AG-UI 的多角色消息整理为 OpenAI Chat Completions 可接收的上下文。
export function toOpenAIChatMessages(
  messages: Message[],
): ChatCompletionMessageParam[] {
  const openAIMessages: ChatCompletionMessageParam[] = [];

  for (const message of messages) {
    const content = messageContentToText(message.content);
    if (!content) {
      continue;
    }

    switch (message.role) {
      case 'system':
      case 'developer':
        openAIMessages.push({ role: 'system', content });
        break;
      case 'user':
        openAIMessages.push({ role: 'user', content });
        break;
      case 'assistant':
        openAIMessages.push({ role: 'assistant', content });
        break;
      case 'tool':
        openAIMessages.push({
          role: 'user',
          content: `工具结果：\n${content}`,
        });
        break;
      default:
        break;
    }
  }

  return openAIMessages;
}
