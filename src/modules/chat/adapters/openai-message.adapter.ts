import type { Message } from '@ag-ui/core';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { messageContentToText } from './ag-ui.adapter';

export function toOpenAIChatMessages(
  messages: Message[],
): ChatCompletionMessageParam[] {
  return messages
    .map(toOpenAIChatMessage)
    .filter(
      (message): message is ChatCompletionMessageParam => message !== null,
    );
}

function toOpenAIChatMessage(
  message: Message,
): ChatCompletionMessageParam | null {
  const content = messageContentToText(message.content);
  if (!content) {
    return null;
  }

  switch (message.role) {
    case 'system':
    case 'developer':
      return { role: 'system', content };
    case 'user':
      return { role: 'user', content };
    case 'assistant':
      return { role: 'assistant', content };
    case 'tool':
      return { role: 'user', content: `Tool result:\n${content}` };
    default:
      return null;
  }
}
