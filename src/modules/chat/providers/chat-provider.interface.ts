import type { Message } from '@ag-ui/core';

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
