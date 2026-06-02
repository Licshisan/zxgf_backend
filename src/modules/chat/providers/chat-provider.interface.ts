import type { Message, RunAgentInput } from '@ag-ui/core';

export type ChatProviderName = 'mock' | 'openai';

export type ChatProviderEvent =
  | {
      type: 'text-delta';
      delta: string;
    }
  | {
      type: 'thinking-delta';
      delta: string;
    };

export interface ChatProviderOptions {
  provider?: ChatProviderName;
  model?: string;
  temperature?: number;
  reasoning?: {
    enabled?: boolean;
    effort?: 'minimal' | 'low' | 'medium' | 'high';
    summary?: 'auto' | 'concise' | 'detailed';
  };
}

export interface ChatProviderInput {
  messages: Message[];
  options: ChatProviderOptions;
  signal: AbortSignal;
}

export interface ChatProvider {
  readonly name: ChatProviderName;
  streamChat(input: ChatProviderInput): AsyncIterable<ChatProviderEvent>;
}

export function getProviderOptions(
  input: Partial<RunAgentInput>,
): ChatProviderOptions {
  const forwardedProps: unknown = input.forwardedProps as unknown;
  if (
    typeof forwardedProps !== 'object' ||
    forwardedProps === null ||
    Array.isArray(forwardedProps)
  ) {
    return {};
  }

  const props = forwardedProps as Record<string, unknown>;
  return {
    provider: isChatProviderName(props.provider) ? props.provider : undefined,
    model: typeof props.model === 'string' ? props.model : undefined,
    temperature:
      typeof props.temperature === 'number' ? props.temperature : undefined,
    reasoning: getReasoningOptions(props.reasoning),
  };
}

function isChatProviderName(value: unknown): value is ChatProviderName {
  return value === 'mock' || value === 'openai';
}

function getReasoningOptions(value: unknown): ChatProviderOptions['reasoning'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const reasoning = value as Record<string, unknown>;
  return {
    enabled:
      typeof reasoning.enabled === 'boolean' ? reasoning.enabled : undefined,
    effort: isReasoningEffort(reasoning.effort) ? reasoning.effort : undefined,
    summary: isReasoningSummary(reasoning.summary)
      ? reasoning.summary
      : undefined,
  };
}

function isReasoningEffort(
  value: unknown,
): value is NonNullable<ChatProviderOptions['reasoning']>['effort'] {
  return (
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high'
  );
}

function isReasoningSummary(
  value: unknown,
): value is NonNullable<ChatProviderOptions['reasoning']>['summary'] {
  return value === 'auto' || value === 'concise' || value === 'detailed';
}
