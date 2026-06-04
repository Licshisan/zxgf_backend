import type { Message } from '@ag-ui/core';

export type LlmProviderName = 'mock' | 'openai';

export type LlmProviderEvent =
  | {
      type: 'text-delta';
      delta: string;
    }
  | {
      type: 'thinking-delta';
      delta: string;
    };

export interface LlmProviderOptions {
  provider?: LlmProviderName;
  model?: string;
  temperature?: number;
  rag?: {
    enabled?: boolean;
    topK?: number;
    minScore?: number;
    sourceId?: string;
    filters?: Record<string, unknown>;
  };
  profile?: {
    enabled?: boolean;
    update?: boolean;
  };
  reasoning?: {
    enabled?: boolean;
    effort?: 'minimal' | 'low' | 'medium' | 'high';
    summary?: 'auto' | 'concise' | 'detailed';
  };
}

export interface LlmProviderInput {
  messages: Message[];
  options: LlmProviderOptions;
  signal: AbortSignal;
}

export interface LlmProvider {
  readonly name: LlmProviderName;
  streamChat(input: LlmProviderInput): AsyncIterable<LlmProviderEvent>;
}
