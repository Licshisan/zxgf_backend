import { randomUUID } from 'node:crypto';
import {
  EventType,
  type AGUIEvent,
  type RunAgentInput,
} from '@ag-ui/core';
import type {
  LlmProviderEvent,
  LlmProviderName,
  LlmProviderOptions,
} from '../../../shared/llm/llm-provider.interface';
export {
  messageContentToText,
  toOpenAIChatMessages,
} from '../../../shared/llm/llm-message.adapter';

export function getProviderOptions(
  input: Partial<RunAgentInput>,
): LlmProviderOptions {
  type ReasoningEffort = NonNullable<
    NonNullable<LlmProviderOptions['reasoning']>['effort']
  >;
  type ReasoningSummary = NonNullable<
    NonNullable<LlmProviderOptions['reasoning']>['summary']
  >;

  const providers = ['mock', 'openai'] satisfies LlmProviderName[];
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
  const options: LlmProviderOptions = {};

  if (providers.includes(props.provider as LlmProviderName)) {
    options.provider = props.provider as LlmProviderName;
  }

  if (typeof props.model === 'string') {
    options.model = props.model;
  }

  if (typeof props.temperature === 'number') {
    options.temperature = props.temperature;
  }

  if (
    typeof props.rag === 'object' &&
    props.rag !== null &&
    !Array.isArray(props.rag)
  ) {
    const rag = props.rag as Record<string, unknown>;
    const parsedRag: NonNullable<LlmProviderOptions['rag']> = {};

    if (typeof rag.enabled === 'boolean') {
      parsedRag.enabled = rag.enabled;
    }

    if (
      Number.isInteger(rag.topK) &&
      typeof rag.topK === 'number' &&
      rag.topK >= 1 &&
      rag.topK <= 20
    ) {
      parsedRag.topK = rag.topK;
    }

    if (
      typeof rag.minScore === 'number' &&
      Number.isFinite(rag.minScore) &&
      rag.minScore >= 0 &&
      rag.minScore <= 1
    ) {
      parsedRag.minScore = rag.minScore;
    }

    if (typeof rag.sourceId === 'string' && rag.sourceId.trim()) {
      parsedRag.sourceId = rag.sourceId.trim();
    }

    if (
      typeof rag.filters === 'object' &&
      rag.filters !== null &&
      !Array.isArray(rag.filters)
    ) {
      parsedRag.filters = rag.filters as Record<string, unknown>;
    }

    options.rag = parsedRag;
  }

  if (
    typeof props.profile === 'object' &&
    props.profile !== null &&
    !Array.isArray(props.profile)
  ) {
    const profile = props.profile as Record<string, unknown>;
    const parsedProfile: NonNullable<LlmProviderOptions['profile']> = {};

    if (typeof profile.enabled === 'boolean') {
      parsedProfile.enabled = profile.enabled;
    }

    if (typeof profile.update === 'boolean') {
      parsedProfile.update = profile.update;
    }

    options.profile = parsedProfile;
  }

  if (
    typeof props.reasoning === 'object' &&
    props.reasoning !== null &&
    !Array.isArray(props.reasoning)
  ) {
    const reasoning = props.reasoning as Record<string, unknown>;
    const parsedReasoning: NonNullable<LlmProviderOptions['reasoning']> = {};

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

export async function* toAguiStream(
  input: Partial<RunAgentInput>,
  events: AsyncIterable<LlmProviderEvent>,
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
