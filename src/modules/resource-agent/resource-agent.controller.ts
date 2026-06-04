import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user.type';
import { GenerateLearningDocumentDto } from './dto/generate-learning-document.dto';
import { ListGeneratedResourcesDto } from './dto/list-generated-resources.dto';
import { ResourceAgentService } from './resource-agent.service';

@ApiTags('资源生成智能体')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('resource-agent')
export class ResourceAgentController {
  constructor(private readonly resourceAgentService: ResourceAgentService) {}

  @Post('learning-documents/generate')
  @ApiOperation({ summary: '生成学习文档资源' })
  @ApiOkResponse({ description: '学习文档生成成功' })
  generateLearningDocument(
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateLearningDocumentDto,
  ) {
    return this.resourceAgentService.generateLearningDocument(user.sub, dto);
  }

  @Get('resources')
  @ApiOperation({ summary: '查询当前用户生成资源列表' })
  @ApiOkResponse({ description: '查询成功' })
  listMyResources(
    @CurrentUser() user: AuthUser,
    @Query() query: ListGeneratedResourcesDto,
  ) {
    return this.resourceAgentService.listMyResources(user.sub, query);
  }

  @Get('resources/:id')
  @ApiOperation({ summary: '查看生成资源详情' })
  @ApiOkResponse({ description: '查询成功' })
  getMyResource(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.resourceAgentService.getMyResource(user.sub, id);
  }

  @Get('resources/:id/download')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  @ApiOperation({ summary: '下载生成的 docx 文档' })
  @ApiOkResponse({ description: '返回 docx 附件' })
  async downloadResource(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const file = await this.resourceAgentService.getDownload(user.sub, id);
    const encodedName = encodeURIComponent(file.fileName);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodedName}`,
    );
    file.stream.pipe(response);
  }

  @Delete('resources/:id')
  @ApiOperation({ summary: '删除生成资源' })
  @ApiOkResponse({ description: '删除成功' })
  deleteResource(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.resourceAgentService.deleteResource(user.sub, id);
  }
}
