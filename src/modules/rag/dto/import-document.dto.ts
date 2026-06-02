import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ImportDocumentDto {
  @IsString()
  @IsNotEmpty()
  sourceId!: string;

  @IsString()
  @IsOptional()
  sourceTitle?: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @Type(() => Number)
  @IsInt()
  @Min(200)
  @Max(4000)
  @IsOptional()
  chunkSize?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  @IsOptional()
  overlap?: number;
}
