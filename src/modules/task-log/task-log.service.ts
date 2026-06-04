import { Injectable, Logger } from '@nestjs/common';
import { type AgentTaskStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { ListTaskLogsDto } from './dto/list-task-logs.dto';

type JsonRecord = Record<string, unknown>;
const TASK_STATUS = {
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const satisfies Record<string, AgentTaskStatus>;

export interface StartTaskLogInput {
  userId?: string;
  sessionId?: string;
  messageId?: string;
  agentName: string;
  taskType: string;
  input?: JsonRecord;
}

@Injectable()
export class TaskLogService {
  private readonly logger = new Logger(TaskLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async startTask(input: StartTaskLogInput): Promise<string | null> {
    try {
      const task = await this.prisma.agentTaskLog.create({
        data: {
          userId: input.userId,
          sessionId: input.sessionId,
          messageId: input.messageId,
          agentName: input.agentName,
          taskType: input.taskType,
          status: TASK_STATUS.RUNNING,
          input: this.toJson(input.input),
        },
        select: { id: true },
      });

      return task.id;
    } catch (err) {
      this.logger.warn(`Failed to start task log: ${this.errorMessage(err)}`);
      return null;
    }
  }

  async succeedTask(id: string | null, output?: JsonRecord): Promise<void> {
    await this.finishTask(id, TASK_STATUS.SUCCEEDED, output);
  }

  async failTask(
    id: string | null,
    error: unknown,
    output?: JsonRecord,
  ): Promise<void> {
    await this.finishTask(id, TASK_STATUS.FAILED, output, error);
  }

  async listMyTasks(userId: string, query: ListTaskLogsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AgentTaskLogWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.taskType ? { taskType: query.taskType } : {}),
      ...(query.agentName ? { agentName: query.agentName } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.agentTaskLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.agentTaskLog.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
    };
  }

  private async finishTask(
    id: string | null,
    status: AgentTaskStatus,
    output?: JsonRecord,
    error?: unknown,
  ): Promise<void> {
    if (!id) return;

    try {
      await this.prisma.agentTaskLog.update({
        where: { id },
        data: {
          status,
          output: this.toJson(output),
          error: error ? this.errorMessage(error) : null,
          finishedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to finish task log: ${this.errorMessage(err)}`);
    }
  }

  private toJson(value: JsonRecord | undefined): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
