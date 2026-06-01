import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, Matches } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: '已注册邮箱',
    example: 'student001@example.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: '找回密码验证码',
    example: '123456',
  })
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiProperty({
    description: '新密码，至少 8 位且包含字母和数字',
    example: 'NewPassword123',
    minLength: 8,
  })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/)
  newPassword!: string;
}
