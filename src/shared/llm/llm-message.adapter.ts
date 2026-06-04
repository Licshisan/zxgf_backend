import type { Message } from '@ag-ui/core';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

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
    if (!['text', 'markdown'].includes(item.type)) continue;

    const contentStr = item.text ?? item.data ?? '';
    if (contentStr) {
      textParts.push(contentStr);
    }
  }

  return textParts.join('\n').trim();
}

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
