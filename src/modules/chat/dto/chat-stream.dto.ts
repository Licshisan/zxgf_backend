import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChatStreamDto {
  @ApiProperty({
    description: '用户输入的消息',
    example: '你好，介绍一下人工智能',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}
