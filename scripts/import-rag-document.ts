import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { RagModule } from '../src/modules/rag/rag.module';
import { RagService } from '../src/modules/rag/rag.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    RagModule,
  ],
})
class RagImportModule {}

interface CliOptions {
  file?: string;
  courseDir?: string;
  sourceId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  chunkStrategy?: 'text' | 'markdown';
  chunkSize?: number;
  overlap?: number;
}

interface CourseMeta {
  course_id?: string;
  course_name?: string;
  en_name?: string;
}

interface ChapterEntry {
  chapter_id: string;
  chapter_name: string;
  sort?: number;
  child?: SectionEntry[];
}

interface SectionEntry {
  section_id: string;
  section_name: string;
}

interface ChapterFile {
  chapter_list?: ChapterEntry[];
}

interface SectionContext {
  chapterId: string;
  chapterName: string;
  sectionId: string;
  sectionName: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = {};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case '--file':
        options.file = next;
        index++;
        break;
      case '--course-dir':
        options.courseDir = next;
        index++;
        break;
      case '--source-id':
        options.sourceId = next;
        index++;
        break;
      case '--title':
        options.title = next;
        index++;
        break;
      case '--metadata':
        options.metadata = JSON.parse(next) as Record<string, unknown>;
        index++;
        break;
      case '--chunk-strategy':
        if (next !== 'text' && next !== 'markdown') {
          throw new Error('--chunk-strategy must be "text" or "markdown"');
        }
        options.chunkStrategy = next;
        index++;
        break;
      case '--chunk-size':
        options.chunkSize = Number(next);
        index++;
        break;
      case '--overlap':
        options.overlap = Number(next);
        index++;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.file && !options.courseDir) {
    throw new Error(
      'Missing --file or --course-dir. Example: npm run rag:import -- --course-dir ./knowledge_base/operating_system',
    );
  }

  if (options.file && options.courseDir) {
    throw new Error('Use either --file or --course-dir, not both');
  }

  return options as CliOptions;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

function buildSectionMap(
  chapterFile: ChapterFile,
): Map<string, SectionContext> {
  const sectionMap = new Map<string, SectionContext>();

  for (const chapter of chapterFile.chapter_list ?? []) {
    for (const section of chapter.child ?? []) {
      sectionMap.set(section.section_id, {
        chapterId: chapter.chapter_id,
        chapterName: chapter.chapter_name,
        sectionId: section.section_id,
        sectionName: section.section_name,
      });
    }
  }

  return sectionMap;
}

function inferSectionContext(
  fileName: string,
  sectionMap: Map<string, SectionContext>,
): SectionContext {
  const match = /^(ch\d{2})_(\d{2})_(.+)\.md$/u.exec(fileName);
  if (!match) {
    throw new Error(`Cannot infer section id from file name: ${fileName}`);
  }

  const sectionId = `${match[1]}_${match[2]}`;
  const mapped = sectionMap.get(sectionId);
  if (mapped) return mapped;

  return {
    chapterId: match[1],
    chapterName: match[1],
    sectionId,
    sectionName: match[3].replace(/_/g, ' '),
  };
}

async function importSingleFile(ragService: RagService, options: CliOptions) {
  if (!options.file) {
    throw new Error('Missing --file');
  }

  const filePath = resolve(options.file);
  const content = await readFile(filePath, 'utf8');
  const fileName = basename(filePath);
  const chunkStrategy =
    options.chunkStrategy ??
    (extname(fileName) === '.md' ? 'markdown' : 'text');

  const result = await ragService.importDocument({
    sourceId: options.sourceId ?? fileName,
    sourceTitle: options.title ?? fileName,
    content,
    metadata: {
      ...(options.metadata ?? {}),
      filePath,
    },
    chunkStrategy,
    chunkContextTitle: options.title ?? fileName,
    chunkSize: options.chunkSize,
    overlap: options.overlap,
  });

  console.log(
    `Imported ${result.chunkCount} chunks for source ${result.sourceId}`,
  );
}

async function importCourse(ragService: RagService, options: CliOptions) {
  if (!options.courseDir) {
    throw new Error('Missing --course-dir');
  }

  const courseDir = resolve(options.courseDir);
  const contentDir = join(courseDir, 'content');
  const courseMeta = await readJson<CourseMeta>(
    join(courseDir, 'course_meta.json'),
  );
  const chapterFile = await readJson<ChapterFile>(
    join(courseDir, 'chapter.json'),
  );
  const sectionMap = buildSectionMap(chapterFile);
  const courseId = courseMeta.course_id ?? basename(courseDir);
  const courseName = courseMeta.course_name ?? courseMeta.en_name ?? courseId;

  const files = (await readdir(contentDir))
    .filter((file) => extname(file) === '.md')
    .sort((left, right) => left.localeCompare(right, 'zh-CN'));

  let totalChunks = 0;

  for (const fileName of files) {
    const filePath = join(contentDir, fileName);
    const content = await readFile(filePath, 'utf8');
    const section = inferSectionContext(fileName, sectionMap);
    const sourceId = `${courseId}:${section.sectionId}`;
    const contextTitle = [
      courseName,
      section.chapterName,
      section.sectionName,
    ].join(' > ');

    const result = await ragService.importDocument({
      sourceId,
      sourceTitle: section.sectionName,
      content,
      metadata: {
        ...(options.metadata ?? {}),
        courseId,
        courseName,
        chapterId: section.chapterId,
        chapterName: section.chapterName,
        sectionId: section.sectionId,
        sectionName: section.sectionName,
        filePath,
      },
      chunkStrategy: 'markdown',
      chunkContextTitle: contextTitle,
      chunkSize: options.chunkSize,
      overlap: options.overlap,
    });

    totalChunks += result.chunkCount;
    console.log(`Imported ${result.chunkCount} chunks for source ${sourceId}`);
  }

  console.log(
    `Imported ${totalChunks} chunks from ${files.length} course files`,
  );
}

async function bootstrap() {
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(RagImportModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const ragService = app.get(RagService);
    if (options.courseDir) {
      await importCourse(ragService, options);
    } else {
      await importSingleFile(ragService, options);
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
