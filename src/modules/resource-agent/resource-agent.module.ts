import { Module } from '@nestjs/common';
import { LlmModule } from '../../shared/llm/llm.module';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RagModule } from '../rag/rag.module';
import { TaskLogModule } from '../task-log/task-log.module';
import { ResourceAgentController } from './resource-agent.controller';
import { ResourceAgentService } from './resource-agent.service';

@Module({
  imports: [AuthModule, PrismaModule, LlmModule, RagModule, TaskLogModule],
  controllers: [ResourceAgentController],
  providers: [ResourceAgentService],
})
export class ResourceAgentModule {}
