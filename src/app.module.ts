import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './shared/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { ProfileModule } from './modules/profile/profile.module';
import { RagModule } from './modules/rag/rag.module';
import { ResourceAgentModule } from './modules/resource-agent/resource-agent.module';
import { SessionModule } from './modules/sessions/session.module';
import { TaskLogModule } from './modules/task-log/task-log.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    AuthModule,
    ChatModule,
    ProfileModule,
    RagModule,
    ResourceAgentModule,
    SessionModule,
    TaskLogModule,
  ],
})
export class AppModule {}
