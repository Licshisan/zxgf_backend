import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListGeneratedResourcesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number;

  @IsIn(['LEARNING_DOCUMENT'])
  @IsOptional()
  type?: 'LEARNING_DOCUMENT';

  @IsIn(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'])
  @IsOptional()
  status?: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
}
