import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class SendEmailCodeDto {
  @ApiProperty({
    description: '接收验证码的邮箱',
    example: 'student001@example.com',
  })
  @IsEmail()
  email!: string;
}
