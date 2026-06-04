import { AgentTaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListTaskLogsDto {
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

  @IsEnum(AgentTaskStatus)
  @IsOptional()
  status?: AgentTaskStatus;

  @IsString()
  @IsOptional()
  taskType?: string;

  @IsString()
  @IsOptional()
  agentName?: string;
}
