import type { Message } from '@ag-ui/core';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class ChatStreamDto {
  @IsString()
  sessionId!: string;

  @IsString()
  @IsOptional()
  threadId?: string;

  @IsString()
  @IsOptional()
  runId?: string;

  @IsString()
  @IsOptional()
  parentRunId?: string;

  @IsArray()
  @IsOptional()
  messages?: Message[];

  @IsObject()
  @IsOptional()
  forwardedProps?: Record<string, unknown>;

  @IsOptional()
  state?: unknown;

  @IsArray()
  @IsOptional()
  tools?: unknown[];

  @IsArray()
  @IsOptional()
  context?: unknown[];
}
