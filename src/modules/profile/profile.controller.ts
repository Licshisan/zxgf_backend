import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user.type';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('用户画像')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @ApiOperation({
    summary: '读取当前用户画像',
    description: '返回当前登录用户的六维画像；如果尚未生成，则返回空画像结构。',
  })
  @ApiOkResponse({ description: '读取成功' })
  me(@CurrentUser() user: AuthUser) {
    return this.profileService.getProfile(user.sub);
  }

  @Put('me')
  @ApiOperation({
    summary: '更新当前用户画像',
    description:
      '预留给人工编辑或后续画像 worker 使用。当前实现为完整覆盖画像 JSON。',
  })
  @ApiOkResponse({ description: '更新成功' })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(user.sub, dto.profile);
  }
}
