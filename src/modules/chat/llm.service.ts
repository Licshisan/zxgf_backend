import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EventType,
  type AGUIEvent,
  type Message,
  type RunAgentInput,
} from '@ag-ui/core';
import { randomUUID } from 'node:crypto';

type OpenAIChatRole = 'system' | 'user' | 'assistant';

interface OpenAIChatMessage {
  role: OpenAIChatRole;
  content: string;
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

@Injectable()
export class LlmService {
  constructor(private readonly config: ConfigService) {}

  async *runAgent(
    input: Partial<RunAgentInput>,
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

    for await (const delta of this.streamChat(input.messages || [], signal)) {
      if (signal.aborted) return;

      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta,
        timestamp: Date.now(),
      };
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

  async *streamChat(
    messages: Message[],
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    if (signal.aborted) return;

    const body = {
      model: this.getModel(),
      messages: this.toOpenAIMessages(messages),
      stream: true,
    };

    if (body.messages.length === 0) {
      throw new Error('No text chat messages were provided');
    }

    try {
      const response = await fetch(this.getChatCompletionsUrl(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.getApiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw new Error(await this.createHttpErrorMessage(response));
      }

      if (!response.body) {
        throw new Error('LLM response body is empty');
      }

      yield* this.parseStream(response.body, signal);
    } catch (err) {
      if (signal.aborted || this.isAbortError(err)) {
        return;
      }

      throw err;
    }
  }

  private async *parseStream(
    stream: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const data = this.extractSseData(line);
          if (data === null) continue;
          if (data === '[DONE]') return;

          const delta = this.parseDelta(data);
          if (delta) {
            yield delta;
          }
        }
      }

      const data = this.extractSseData(buffer);
      if (data && data !== '[DONE]') {
        const delta = this.parseDelta(data);
        if (delta) {
          yield delta;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseDelta(data: string): string {
    let chunk: ChatCompletionChunk;

    try {
      chunk = JSON.parse(data) as ChatCompletionChunk;
    } catch {
      return '';
    }

    if (chunk.error?.message) {
      throw new Error(chunk.error.message);
    }

    return chunk.choices?.[0]?.delta?.content ?? '';
  }

  private extractSseData(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) {
      return null;
    }

    return trimmed.slice('data:'.length).trim();
  }

  private toOpenAIMessages(messages: Message[]): OpenAIChatMessage[] {
    return messages
      .map((message) => this.toOpenAIMessage(message))
      .filter((message): message is OpenAIChatMessage => message !== null);
  }

  private toOpenAIMessage(message: Message): OpenAIChatMessage | null {
    switch (message.role) {
      case 'system':
        return this.textMessage('system', message.content);
      case 'developer':
        return this.textMessage('system', message.content);
      case 'user':
        return this.textMessage('user', message.content);
      case 'assistant':
        return this.textMessage('assistant', message.content ?? '');
      case 'tool':
        return this.textMessage('user', `Tool result:\n${message.content}`);
      default:
        return null;
    }
  }

  private textMessage(
    role: OpenAIChatRole,
    content: Message['content'],
  ): OpenAIChatMessage | null {
    const text = this.messageContentToText(content);
    if (!text) {
      return null;
    }

    return { role, content: text };
  }

  private messageContentToText(content: Message['content']): string {
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

  private getChatCompletionsUrl(): string {
    const configuredBaseUrl =
      this.config.get<string>('LLM_BASE_URL') ??
      this.config.get<string>('OPENAI_BASE_URL');
    const baseUrl = configuredBaseUrl?.trim() || 'https://api.openai.com/v1';

    const normalized = baseUrl.replace(/\/+$/, '');
    if (normalized.endsWith('/chat/completions')) {
      return normalized;
    }

    return `${normalized}/chat/completions`;
  }

  private getApiKey(): string {
    const apiKey =
      this.config.get<string>('LLM_API_KEY') ??
      this.config.get<string>('OPENAI_API_KEY');

    if (!apiKey?.trim()) {
      throw new Error('LLM_API_KEY is required');
    }

    return apiKey.trim();
  }

  private getModel(): string {
    const model = (
      this.config.get<string>('LLM_MODEL') ??
      this.config.get<string>('OPENAI_MODEL') ??
      'gpt-4o-mini'
    ).trim();

    return model || 'gpt-4o-mini';
  }

  private async createHttpErrorMessage(response: Response): Promise<string> {
    const text = await response.text().catch(() => '');
    const details = text.trim() ? `: ${this.compact(text)}` : '';
    return `LLM request failed with status ${response.status}${details}`;
  }

  private compact(text: string): string {
    return text.replace(/\s+/g, ' ').slice(0, 500);
  }

  private isAbortError(err: unknown): boolean {
    return err instanceof Error && err.name === 'AbortError';
  }
}
