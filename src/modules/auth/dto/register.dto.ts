import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: '用户名，仅支持字母、数字、下划线和短横线',
    example: 'student001',
    minLength: 3,
    maxLength: 64,
  })
  @Matches(/^[A-Za-z0-9_-]{3,64}$/)
  username!: string;

  @ApiProperty({
    description: '邮箱，用于登录和接收验证码',
    example: 'student001@example.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: '密码，至少 8 位且包含字母和数字',
    example: 'Password123',
    minLength: 8,
  })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/)
  password!: string;

  @ApiProperty({
    description: '注册邮箱验证码',
    example: '123456',
  })
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiPropertyOptional({
    description: '用户身份，默认学生',
    enum: [UserRole.STUDENT, UserRole.TEACHER],
    default: UserRole.STUDENT,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    description: '显示名称',
    example: 'Zhang San',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;
}
