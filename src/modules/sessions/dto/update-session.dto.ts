import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSessionDto {
  @IsString()
  @MaxLength(200)
  @IsOptional()
  title?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  course?: string;

  @IsString()
  @IsOptional()
  goal?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
