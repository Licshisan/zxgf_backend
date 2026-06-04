import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user.type';
import { ListTaskLogsDto } from './dto/list-task-logs.dto';
import { TaskLogService } from './task-log.service';

@ApiTags('智能体任务日志')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agent-task-logs')
export class TaskLogController {
  constructor(private readonly taskLogService: TaskLogService) {}

  @Get('my')
  @ApiOperation({
    summary: '查询当前用户智能体任务日志',
    description:
      '分页返回当前登录用户的智能体任务日志，支持按状态、任务类型和智能体名称过滤。',
  })
  @ApiOkResponse({ description: '查询成功' })
  listMyTasks(@CurrentUser() user: AuthUser, @Query() query: ListTaskLogsDto) {
    return this.taskLogService.listMyTasks(user.sub, query);
  }
}
