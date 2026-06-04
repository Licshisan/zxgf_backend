import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { RagModule } from '../rag/rag.module';
import { SessionModule } from '../sessions/session.module';
import { TaskLogModule } from '../task-log/task-log.module';
import { LlmModule } from '../../shared/llm/llm.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [
    AuthModule,
    ProfileModule,
    RagModule,
    SessionModule,
    TaskLogModule,
    LlmModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
