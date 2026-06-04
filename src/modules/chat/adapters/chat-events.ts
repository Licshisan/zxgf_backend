import { randomUUID } from 'node:crypto';
import {
  EventType,
  type AGUIEvent,
  type Message,
  type RunAgentInput,
} from '@ag-ui/core';
import type { AuthUser } from '../../../common/types/auth-user.type';
import type { LlmProviderOptions } from '../../../shared/llm/llm-provider.interface';
import type { UserProfileData } from '../../profile/types/user-profile.type';
import { getProviderOptions, messageContentToText } from './chat.adapter';

export interface ChatRunContext {
  input: Partial<RunAgentInput>;
  options: LlmProviderOptions;
  threadId: string;
  runId: string;
  messageId: string;
  userId: string;
  messages: Message[];
  userText: string;
  assistantText: string;
  profile: UserProfileData | null;
}

export function createRunContext(
  input: Partial<RunAgentInput>,
  user: AuthUser,
): ChatRunContext {
  const messages = input.messages || [];

  return {
    input,
    options: getProviderOptions(input),
    threadId: input.threadId || '123',
    runId: input.runId || 'run_id',
    messageId: `msg_${randomUUID()}`,
    userId: user.sub,
    messages,
    userText: getLastUserMessageText(messages),
    assistantText: '',
    profile: null,
  };
}

export function prependSystemMessage(
  messages: Message[],
  idPrefix: string,
  content: string,
): Message[] {
  if (!content) return messages;

  return [
    {
      id: `${idPrefix}_${randomUUID()}`,
      role: 'system',
      content,
    },
    ...messages,
  ];
}

export function getLastUserMessageText(messages: Message[]): string {
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'user');

  return lastUserMessage ? messageContentToText(lastUserMessage.content) : '';
}

export function createRunStartedEvent(context: ChatRunContext): AGUIEvent {
  return {
    type: EventType.RUN_STARTED,
    threadId: context.threadId,
    runId: context.runId,
    timestamp: Date.now(),
  };
}

export function createTextStartEvent(context: ChatRunContext): AGUIEvent {
  return {
    type: EventType.TEXT_MESSAGE_START,
    messageId: context.messageId,
    role: 'assistant',
    timestamp: Date.now(),
  };
}

export function createTextDeltaEvent(
  context: ChatRunContext,
  delta: string,
): AGUIEvent {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: context.messageId,
    delta,
    timestamp: Date.now(),
  };
}

export function createTextEndEvent(context: ChatRunContext): AGUIEvent {
  return {
    type: EventType.TEXT_MESSAGE_END,
    messageId: context.messageId,
    timestamp: Date.now(),
  };
}

export function createRunFinishedEvent(context: ChatRunContext): AGUIEvent {
  return {
    type: EventType.RUN_FINISHED,
    threadId: context.threadId,
    runId: context.runId,
    outcome: {
      type: 'success',
    },
    timestamp: Date.now(),
  };
}

export function createToolCallStartEvent(
  toolCallId: string,
  toolCallName: string,
): AGUIEvent {
  return {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName,
    timestamp: Date.now(),
  };
}

export function createToolCallArgsEvent(
  toolCallId: string,
  args: unknown,
): AGUIEvent {
  return {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: JSON.stringify(args),
    timestamp: Date.now(),
  };
}

export function createToolCallEndEvent(toolCallId: string): AGUIEvent {
  return {
    type: EventType.TOOL_CALL_END,
    toolCallId,
    timestamp: Date.now(),
  };
}

export function createToolCallResultEvent(
  toolCallId: string,
  content: unknown,
): AGUIEvent {
  return {
    type: EventType.TOOL_CALL_RESULT,
    messageId: `tool_${randomUUID()}`,
    toolCallId,
    content: JSON.stringify(content),
    role: 'tool',
    timestamp: Date.now(),
  };
}
