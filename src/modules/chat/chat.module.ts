import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatController } from './chat.controller';
import { LlmService } from './llm.service';
import { MockService } from './mock.service';

@Module({
  imports: [AuthModule],
  controllers: [ChatController],
  providers: [LlmService, MockService],
})
export class ChatModule {}
