import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
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

  @Patch('me')
  @ApiOperation({
    summary: '增量更新当前用户画像',
    description: '提交用户画像局部维度，服务端会与当前画像合并后保存。',
  })
  @ApiOkResponse({ description: '更新成功' })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(user.sub, dto.profile);
  }
}
