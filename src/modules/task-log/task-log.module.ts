import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { TaskLogController } from './task-log.controller';
import { TaskLogService } from './task-log.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [TaskLogController],
  providers: [TaskLogService],
  exports: [TaskLogService],
})
export class TaskLogModule {}
