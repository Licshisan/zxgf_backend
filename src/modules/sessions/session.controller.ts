import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user.type';
import { CreateSessionDto } from './dto/create-session.dto';
import { ListSessionsDto } from './dto/list-sessions.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionService } from './session.service';

@ApiTags('智能体会话')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  @ApiOperation({ summary: '新建会话' })
  @ApiOkResponse({ description: '会话创建成功' })
  createSession(@CurrentUser() user: AuthUser, @Body() dto: CreateSessionDto) {
    return this.sessionService.createSession(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: '查询当前用户会话列表' })
  @ApiOkResponse({ description: '查询成功' })
  listMySessions(
    @CurrentUser() user: AuthUser,
    @Query() query: ListSessionsDto,
  ) {
    return this.sessionService.listMySessions(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '打开会话并获取历史消息' })
  @ApiOkResponse({ description: '查询成功' })
  getMySession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sessionService.getMySession(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新会话信息' })
  @ApiOkResponse({ description: '更新成功' })
  updateSession(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionService.updateSession(user.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除会话' })
  @ApiOkResponse({ description: '删除成功' })
  deleteSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sessionService.deleteSession(user.sub, id);
  }
}
