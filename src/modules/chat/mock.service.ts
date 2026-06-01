import { Injectable } from '@nestjs/common';
import { type AGUIEvent, type RunAgentInput } from '@ag-ui/core';
import { toAguiStream } from './adapters/ag-ui.adapter';
import { MockChatProvider } from './providers/mock-chat.provider';

@Injectable()
export class MockService {
  constructor(private readonly mockProvider: MockChatProvider) {}

  runAgent(
    input: Partial<RunAgentInput>,
    signal: AbortSignal,
  ): AsyncGenerator<AGUIEvent> {
    return toAguiStream(
      input,
      this.mockProvider.streamChat({
        messages: input.messages || [],
        options: {},
        signal,
      }),
      signal,
    );
  }
}
