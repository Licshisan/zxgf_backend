import { Injectable, NotFoundException } from '@nestjs/common';
import { MessageContentType, MessageRole, Prisma } from '@prisma/client';
import type { Message } from '@ag-ui/core';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { messageContentToText } from '../../shared/llm/llm-message.adapter';
import type { CreateSessionDto } from './dto/create-session.dto';
import type { ListSessionsDto } from './dto/list-sessions.dto';
import type { UpdateSessionDto } from './dto/update-session.dto';

type SessionMessageRole = Extract<Message['role'], 'user' | 'assistant'>;

export interface AppendSessionMessageInput {
  sessionId: string;
  userId: string;
  role: SessionMessageRole;
  content: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(userId: string, dto: CreateSessionDto) {
    return this.prisma.session.create({
      data: {
        userId,
        title: this.optionalText(dto.title),
        course: this.optionalText(dto.course),
        goal: this.optionalText(dto.goal),
        metadata: this.toJson(dto.metadata),
      },
    });
  }

  async listMySessions(userId: string, query: ListSessionsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.SessionWhereInput = { userId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.session.count({ where }),
    ]);

    return {
      items: items.map((session) => {
        const latestMessage = session.messages[0] ?? null;
        return {
          id: session.id,
          title: session.title,
          course: session.course,
          goal: session.goal,
          metadata: session.metadata,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          latestMessage: latestMessage
            ? {
                id: latestMessage.id,
                role: latestMessage.role,
                content: latestMessage.content,
                contentType: latestMessage.contentType,
                createdAt: latestMessage.createdAt,
              }
            : null,
        };
      }),
      page,
      pageSize,
      total,
    };
  }

  async getMySession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('会话不存在或无权访问');
    }

    return session;
  }

  async updateSession(
    userId: string,
    sessionId: string,
    dto: UpdateSessionDto,
  ) {
    await this.ensureSessionOwner(userId, sessionId);

    return this.prisma.session.update({
      where: { id: sessionId },
      data: {
        ...(dto.title !== undefined
          ? { title: this.optionalText(dto.title) }
          : {}),
        ...(dto.course !== undefined
          ? { course: this.optionalText(dto.course) }
          : {}),
        ...(dto.goal !== undefined
          ? { goal: this.optionalText(dto.goal) }
          : {}),
        ...(dto.metadata !== undefined
          ? { metadata: this.toJson(dto.metadata) }
          : {}),
      },
    });
  }

  async deleteSession(userId: string, sessionId: string) {
    await this.ensureSessionOwner(userId, sessionId);
    await this.prisma.session.delete({ where: { id: sessionId } });

    return { success: true };
  }

  async getMessagesForChat(
    userId: string,
    sessionId: string,
  ): Promise<Message[]> {
    const session = await this.getMySession(userId, sessionId);

    return session.messages.map((message) => {
      const role =
        message.role === MessageRole.ASSISTANT ? 'assistant' : 'user';

      return {
        id: message.id,
        role,
        content: message.content,
      };
    });
  }

  async appendMessage(input: AppendSessionMessageInput) {
    await this.ensureSessionOwner(input.userId, input.sessionId);

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          sessionId: input.sessionId,
          role: this.toMessageRole(input.role),
          content: input.content,
          contentType: MessageContentType.TEXT,
          metadata: this.toJson(input.metadata),
        },
      });

      await tx.session.update({
        where: { id: input.sessionId },
        data: { updatedAt: new Date() },
      });

      return message;
    });
  }

  async touchSessionTitleIfEmpty(
    userId: string,
    sessionId: string,
    userText: string,
  ): Promise<void> {
    const title = this.createTitle(userText);
    if (!title) return;

    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        OR: [{ title: null }, { title: '' }],
      },
      data: { title },
    });
  }

  getLastUserText(messages: Message[] | undefined): string {
    const lastUserMessage = [...(messages ?? [])]
      .reverse()
      .find((message) => message.role === 'user');

    return lastUserMessage ? messageContentToText(lastUserMessage.content) : '';
  }

  private async ensureSessionOwner(
    userId: string,
    sessionId: string,
  ): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });

    if (!session) {
      throw new NotFoundException('会话不存在或无权访问');
    }
  }

  private toMessageRole(role: SessionMessageRole): MessageRole {
    return role === 'assistant' ? MessageRole.ASSISTANT : MessageRole.USER;
  }

  private optionalText(value: string | undefined): string | null {
    const text = value?.trim();
    return text ? text : null;
  }

  private createTitle(userText: string): string | null {
    const text = userText.replace(/\s+/g, ' ').trim();
    if (!text) return null;
    return text.length > 30 ? `${text.slice(0, 30)}...` : text;
  }

  private toJson(
    value: Record<string, unknown> | undefined,
  ): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }
}
