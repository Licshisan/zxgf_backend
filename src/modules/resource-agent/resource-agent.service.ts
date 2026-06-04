import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Message } from '@ag-ui/core';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import {
  type GeneratedResourceStatus,
  type GeneratedResourceType,
  Prisma,
} from '@prisma/client';
import { LlmProviderRegistry } from '../../shared/llm/llm-provider.registry';
import type { LlmProviderOptions } from '../../shared/llm/llm-provider.interface';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RagService } from '../rag/rag.service';
import { TaskLogService } from '../task-log/task-log.service';
import type { GenerateLearningDocumentDto } from './dto/generate-learning-document.dto';
import type { ListGeneratedResourcesDto } from './dto/list-generated-resources.dto';

const RESOURCE_TYPE = {
  LEARNING_DOCUMENT: 'LEARNING_DOCUMENT',
} as const satisfies Record<string, GeneratedResourceType>;

const RESOURCE_STATUS = {
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const satisfies Record<string, GeneratedResourceStatus>;

type RagSearchOutput = Awaited<ReturnType<RagService['search']>>;

@Injectable()
export class ResourceAgentService {
  private readonly storageRoot = join(
    process.cwd(),
    'uploads',
    'generated-resources',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: LlmProviderRegistry,
    private readonly ragService: RagService,
    private readonly taskLogService: TaskLogService,
  ) {}

  async generateLearningDocument(
    userId: string,
    dto: GenerateLearningDocumentDto,
  ) {
    const title = this.normalizeTitle(dto.title || dto.topic);
    const inputSummary = this.buildInputSummary(dto);
    const resource = await this.prisma.generatedResource.create({
      data: {
        userId,
        title,
        type: RESOURCE_TYPE.LEARNING_DOCUMENT,
        status: RESOURCE_STATUS.RUNNING,
        input: this.toJson(inputSummary),
        metadata: this.toJson({ format: 'docx' }),
      },
    });
    const taskId = await this.taskLogService.startTask({
      userId,
      agentName: 'resource',
      taskType: 'resource.generate_learning_document',
      input: {
        resourceId: resource.id,
        topicLength: dto.topic.length,
        learningGoalLength: dto.learningGoal?.length ?? 0,
        ragEnabled: this.shouldUseRag(dto),
        provider: dto.options?.provider ?? 'openai',
        model: dto.options?.model,
      },
    });

    try {
      const ragResult = await this.searchRagIfNeeded(dto);
      const prompt = this.buildGenerationPrompt(dto, ragResult);
      const content = await this.generateText(prompt, {
        provider: dto.options?.provider,
        model: dto.options?.model,
        temperature: dto.options?.temperature,
        rag: { enabled: false },
        profile: { enabled: false, update: false },
      });
      const fileName = `${this.safeFileName(title)}-${resource.id}.docx`;
      const filePath = await this.writeDocxFile({
        userId,
        resourceId: resource.id,
        fileName,
        title,
        content,
      });
      const metadata = {
        format: 'docx',
        ragEnabled: Boolean(ragResult),
        ragResultCount: ragResult?.results.length ?? 0,
        ragSources: ragResult
          ? [
              ...new Set(
                ragResult.results.map((result) => result.sourceId),
              ),
            ]
          : [],
      };
      const updated = await this.prisma.generatedResource.update({
        where: { id: resource.id },
        data: {
          status: RESOURCE_STATUS.SUCCEEDED,
          prompt,
          content,
          filePath,
          fileName,
          metadata: this.toJson(metadata),
        },
      });

      await this.taskLogService.succeedTask(taskId, {
        resourceId: resource.id,
        outputLength: content.length,
        fileName,
        ragResultCount: metadata.ragResultCount,
      });

      return {
        ...updated,
        downloadUrl: `/resource-agent/resources/${updated.id}/download`,
      };
    } catch (err) {
      await this.prisma.generatedResource.update({
        where: { id: resource.id },
        data: {
          status: RESOURCE_STATUS.FAILED,
          error: this.errorMessage(err),
        },
      });
      await this.taskLogService.failTask(taskId, err, {
        resourceId: resource.id,
      });
      throw err;
    }
  }

  async listMyResources(userId: string, query: ListGeneratedResourcesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.GeneratedResourceWhereInput = {
      userId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.generatedResource.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          fileName: true,
          metadata: true,
          error: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.generatedResource.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        downloadUrl:
          item.status === RESOURCE_STATUS.SUCCEEDED
            ? `/resource-agent/resources/${item.id}/download`
            : null,
      })),
      page,
      pageSize,
      total,
    };
  }

  async getMyResource(userId: string, resourceId: string) {
    const resource = await this.findMyResource(userId, resourceId);

    return {
      ...resource,
      downloadUrl:
        resource.status === RESOURCE_STATUS.SUCCEEDED
          ? `/resource-agent/resources/${resource.id}/download`
          : null,
    };
  }

  async getDownload(userId: string, resourceId: string) {
    const resource = await this.findMyResource(userId, resourceId);
    if (
      resource.status !== RESOURCE_STATUS.SUCCEEDED ||
      !resource.filePath ||
      !resource.fileName
    ) {
      throw new NotFoundException('资源文件不存在或尚未生成完成');
    }

    return {
      fileName: resource.fileName,
      stream: createReadStream(resource.filePath),
    };
  }

  async deleteResource(userId: string, resourceId: string) {
    const resource = await this.findMyResource(userId, resourceId);
    await this.prisma.generatedResource.delete({ where: { id: resource.id } });

    if (resource.filePath) {
      await rm(resource.filePath, { force: true });
    }

    return { success: true };
  }

  private async findMyResource(userId: string, resourceId: string) {
    const resource = await this.prisma.generatedResource.findFirst({
      where: { id: resourceId, userId },
    });

    if (!resource) {
      throw new NotFoundException('资源不存在或无权访问');
    }

    return resource;
  }

  private shouldUseRag(dto: GenerateLearningDocumentDto): boolean {
    return Boolean(
      dto.rag?.enabled === true ||
        dto.rag?.sourceId ||
        (dto.rag?.filters && Object.keys(dto.rag.filters).length > 0),
    );
  }

  private async searchRagIfNeeded(
    dto: GenerateLearningDocumentDto,
  ): Promise<RagSearchOutput | null> {
    if (!this.shouldUseRag(dto)) {
      return null;
    }

    return this.ragService.search({
      query: [dto.topic, dto.learningGoal, dto.requirements]
        .filter(Boolean)
        .join('\n'),
      topK: dto.rag?.topK ?? 5,
      minScore: dto.rag?.minScore ?? 0,
      sourceId: dto.rag?.sourceId,
      filters: dto.rag?.filters,
    });
  }

  private buildGenerationPrompt(
    dto: GenerateLearningDocumentDto,
    ragResult: RagSearchOutput | null,
  ): string {
    const ragContext =
      ragResult && ragResult.results.length > 0
        ? ragResult.results
            .map((result, index) => {
              return [
                `资料 ${index + 1}`,
                `来源：${result.sourceTitle || result.sourceId}`,
                `sourceId：${result.sourceId}`,
                `chunkIndex：${result.chunkIndex}`,
                result.content,
              ].join('\n');
            })
            .join('\n\n---\n\n')
        : '无可用知识库上下文。';

    return [
      '你是学习资源生成智能体，请生成一份可直接发给学生使用的学习文档。',
      '输出必须是 Markdown，结构清晰、中文表达准确，不要输出 JSON，不要解释你的生成过程。',
      '',
      `主题：${dto.topic}`,
      `学习目标：${dto.learningGoal || '未指定，请根据主题合理设计'}`,
      `学习者水平：${dto.audienceLevel || '普通学习者'}`,
      `额外要求：${dto.requirements || '无'}`,
      '',
      '文档必须包含：',
      '# 标题',
      '## 学习目标',
      '## 核心概念',
      '## 分章节讲解',
      '## 示例或案例',
      '## 练习题',
      '## 总结',
      '## 参考资料',
      '',
      '如果知识库上下文不足，请基于通用知识生成，但在参考资料中说明“未从知识库检索到足够资料”。',
      '',
      '知识库上下文：',
      ragContext,
    ].join('\n');
  }

  private async generateText(
    prompt: string,
    options: LlmProviderOptions,
  ): Promise<string> {
    const provider = this.providerRegistry.getProvider(options.provider);
    const controller = new AbortController();
    const chunks: string[] = [];
    const messages: Message[] = [
      {
        id: 'resource_generation_system',
        role: 'system',
        content: '你是专业的中文学习文档生成助手。',
      } as Message,
      {
        id: 'resource_generation_user',
        role: 'user',
        content: prompt,
      } as Message,
    ];

    for await (const event of provider.streamChat({
      messages,
      options,
      signal: controller.signal,
    })) {
      if (event.type === 'text-delta' && event.delta) {
        chunks.push(event.delta);
      }
    }

    const content = chunks.join('').trim();
    if (!content) {
      throw new InternalServerErrorException('学习文档生成结果为空');
    }

    return content;
  }

  private async writeDocxFile(input: {
    userId: string;
    resourceId: string;
    fileName: string;
    title: string;
    content: string;
  }): Promise<string> {
    const directory = join(this.storageRoot, input.userId);
    const filePath = join(directory, input.fileName);
    await mkdir(directory, { recursive: true });
    const doc = new Document({
      sections: [
        {
          children: this.markdownToDocxParagraphs(input.title, input.content),
        },
      ],
    });
    const buffer = await Packer.toBuffer(doc);
    await writeFile(filePath, buffer);

    return filePath;
  }

  private markdownToDocxParagraphs(
    title: string,
    markdown: string,
  ): Paragraph[] {
    const paragraphs: Paragraph[] = [
      new Paragraph({
        text: title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      }),
    ];

    for (const rawLine of markdown.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        paragraphs.push(new Paragraph({ text: '' }));
        continue;
      }

      const heading = this.parseHeading(line);
      if (heading) {
        paragraphs.push(
          new Paragraph({
            text: heading.text,
            heading: heading.level,
            spacing: { before: 240, after: 120 },
          }),
        );
        continue;
      }

      const listItem = line.match(/^[-*]\s+(.+)$/);
      if (listItem) {
        paragraphs.push(
          new Paragraph({
            text: listItem[1],
            bullet: { level: 0 },
          }),
        );
        continue;
      }

      const orderedItem = line.match(/^\d+[.)]\s+(.+)$/);
      if (orderedItem) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun(`- ${orderedItem[1]}`)],
          }),
        );
        continue;
      }

      paragraphs.push(
        new Paragraph({
          children: [new TextRun(line)],
          spacing: { after: 120 },
        }),
      );
    }

    return paragraphs;
  }

  private parseHeading(
    line: string,
  ): { level: (typeof HeadingLevel)[keyof typeof HeadingLevel]; text: string } | null {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (!match) return null;

    const levelMap = {
      1: HeadingLevel.HEADING_1,
      2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3,
    } as const;

    return {
      level: levelMap[match[1].length as 1 | 2 | 3],
      text: match[2],
    };
  }

  private buildInputSummary(dto: GenerateLearningDocumentDto) {
    return {
      title: dto.title,
      topic: dto.topic,
      learningGoal: dto.learningGoal,
      audienceLevel: dto.audienceLevel,
      requirementsLength: dto.requirements?.length ?? 0,
      rag: dto.rag
        ? {
            enabled: dto.rag.enabled,
            sourceId: dto.rag.sourceId,
            filterKeys: dto.rag.filters ? Object.keys(dto.rag.filters) : [],
            topK: dto.rag.topK,
            minScore: dto.rag.minScore,
          }
        : null,
      options: {
        provider: dto.options?.provider,
        model: dto.options?.model,
        temperature: dto.options?.temperature,
      },
    };
  }

  private normalizeTitle(title: string): string {
    const normalized = title.replace(/\s+/g, ' ').trim();
    return normalized.length > 80 ? normalized.slice(0, 80) : normalized;
  }

  private safeFileName(title: string): string {
    return title
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80);
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
