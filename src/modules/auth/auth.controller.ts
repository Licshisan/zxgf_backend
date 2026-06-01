import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user.type';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SendEmailCodeDto } from './dto/send-email-code.dto';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('send-register-code')
  @ApiOperation({
    summary: '发送注册验证码',
    description: '向未注册邮箱发送 6 位验证码，验证码 10 分钟内有效。',
  })
  @ApiOkResponse({ description: '验证码发送成功' })
  @ApiConflictResponse({ description: '邮箱已注册' })
  sendRegisterCode(@Body() dto: SendEmailCodeDto) {
    return this.authService.sendRegisterCode(dto);
  }

  @Post('register')
  @ApiOperation({
    summary: '注册账号',
    description: '使用邮箱验证码注册学生或老师账号，普通注册不能创建管理员。',
  })
  @ApiOkResponse({ description: '注册成功，返回用户信息和访问令牌' })
  @ApiBadRequestResponse({ description: '参数错误、验证码错误或验证码过期' })
  @ApiConflictResponse({ description: '用户名或邮箱已存在' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({
    summary: '登录',
    description: '支持使用用户名或邮箱登录，成功后返回访问令牌。',
  })
  @ApiOkResponse({ description: '登录成功，返回用户信息和访问令牌' })
  @ApiUnauthorizedResponse({ description: '账号或密码错误' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('send-reset-code')
  @ApiOperation({
    summary: '发送找回密码验证码',
    description:
      '向已注册邮箱发送 6 位验证码。为避免枚举邮箱，接口返回统一成功信息。',
  })
  @ApiOkResponse({ description: '请求已处理' })
  sendResetCode(@Body() dto: SendEmailCodeDto) {
    return this.authService.sendResetCode(dto);
  }

  @Post('reset-password')
  @ApiOperation({
    summary: '重置密码',
    description: '使用邮箱验证码设置新密码。',
  })
  @ApiOkResponse({ description: '密码重置成功' })
  @ApiBadRequestResponse({ description: '参数错误、验证码错误或验证码过期' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '获取当前用户',
    description: '根据 Bearer Token 返回当前登录用户信息。',
  })
  @ApiOkResponse({ description: '获取成功' })
  @ApiUnauthorizedResponse({ description: '未登录或令牌无效' })
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
