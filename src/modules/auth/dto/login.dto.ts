import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: '用户名或邮箱',
    example: 'student001',
  })
  @IsString()
  @IsNotEmpty()
  account!: string;

  @ApiProperty({
    description: '密码',
    example: 'Password123',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
