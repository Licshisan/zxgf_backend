import { Injectable } from '@nestjs/common';
import { type AGUIEvent, type RunAgentInput } from '@ag-ui/core';
import { toAguiStream } from './adapters/ag-ui.adapter';
import {
  getProviderOptions,
  type ChatProviderEvent,
} from './providers/chat-provider.interface';
import { ChatProviderRegistry } from './providers/chat-provider.registry';

@Injectable()
export class ChatService {
  constructor(private readonly providerRegistry: ChatProviderRegistry) {}

  runAgent(
    input: Partial<RunAgentInput>,
    signal: AbortSignal,
  ): AsyncGenerator<AGUIEvent> {
    const options = getProviderOptions(input);
    const provider = this.providerRegistry.getProvider(options.provider);
    const events = provider.streamChat({
      messages: input.messages || [],
      options,
      signal,
    });

    return toAguiStream(input, events, signal);
  }
}

export type { ChatProviderEvent };
