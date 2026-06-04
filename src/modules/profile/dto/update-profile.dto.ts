import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import * as userProfileType from '../types/user-profile.type';

class ProfileDimensionValueDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  score!: number;

  @IsString()
  label!: string;

  @IsString()
  summary!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @IsArray()
  @IsString({ each: true })
  evidence!: string[];

  @IsString()
  @IsOptional()
  updatedAt?: string;
}

class UserProfileDataDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileDimensionValueDto)
  learningLevel?: ProfileDimensionValueDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileDimensionValueDto)
  goalClarity?: ProfileDimensionValueDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileDimensionValueDto)
  interestDirection?: ProfileDimensionValueDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileDimensionValueDto)
  communicationPreference?: ProfileDimensionValueDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileDimensionValueDto)
  engagement?: ProfileDimensionValueDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileDimensionValueDto)
  knowledgeWeakness?: ProfileDimensionValueDto | null;
}

export class UpdateProfileDto {
  @IsObject()
  @ValidateNested()
  @Type(() => UserProfileDataDto)
  profile!: userProfileType.UserProfilePatch;
}
