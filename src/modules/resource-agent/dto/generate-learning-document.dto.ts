import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { LlmProviderName } from '../../../shared/llm/llm-provider.interface';

class LearningDocumentRagDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  sourceId?: string;

  @IsObject()
  @IsOptional()
  filters?: Record<string, unknown>;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  topK?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  minScore?: number;
}

class LearningDocumentOptionsDto {
  @IsIn(['mock', 'openai'])
  @IsOptional()
  provider?: LlmProviderName;

  @IsString()
  @IsOptional()
  model?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  temperature?: number;
}

export class GenerateLearningDocumentDto {
  @IsString()
  @MaxLength(200)
  @IsOptional()
  title?: string;

  @IsString()
  @MaxLength(500)
  topic!: string;

  @IsString()
  @IsOptional()
  learningGoal?: string;

  @IsString()
  @IsOptional()
  audienceLevel?: string;

  @IsString()
  @IsOptional()
  requirements?: string;

  @ValidateNested()
  @Type(() => LearningDocumentRagDto)
  @IsOptional()
  rag?: LearningDocumentRagDto;

  @ValidateNested()
  @Type(() => LearningDocumentOptionsDto)
  @IsOptional()
  options?: LearningDocumentOptionsDto;
}
