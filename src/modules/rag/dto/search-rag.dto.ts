import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SearchRagDto {
  @IsString()
  @IsNotEmpty()
  query!: string;

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

  @IsString()
  @IsOptional()
  sourceId?: string;

  @IsObject()
  @IsOptional()
  filters?: Record<string, unknown>;
}
