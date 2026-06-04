import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthUser } from '../../common/types/auth-user.type';
import { MailService } from '../../shared/mail/mail.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SendEmailCodeDto } from './dto/send-email-code.dto';

const CODE_TTL_SECONDS = 10 * 60;
const SALT_ROUNDS = 10;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initializeDefaultAdmin();
  }

  async sendRegisterCode(dto: SendEmailCodeDto) {
    const email = dto.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('邮箱已注册');
    }

    const code = await this.saveEmailCode('register', email);
    await this.mailService.sendVerificationCode(email, code, '注册验证码');
    return { message: '验证码已发送' };
  }

  async register(dto: RegisterDto) {
    const username = dto.username.trim();
    const email = dto.email.toLowerCase();

    await this.assertEmailCode('register', email, dto.code);

    const role = dto.role ?? UserRole.STUDENT;
    if (role === UserRole.ADMIN) {
      throw new BadRequestException('不允许注册管理员账号');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
    });
    if (existingUser) {
      throw new ConflictException('用户名或邮箱已存在');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        displayName: dto.displayName,
        role,
      },
    });

    await this.deleteEmailCode('register', email);
    return this.createAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const account = dto.account.trim();
    const where: Prisma.UserWhereInput = account.includes('@')
      ? { email: account.toLowerCase() }
      : { username: account };
    const user = await this.prisma.user.findFirst({ where });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new BadRequestException('账号或密码错误');
    }

    return this.createAuthResponse(user);
  }

  async sendResetCode(dto: SendEmailCodeDto) {
    const email = dto.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      const code = await this.saveEmailCode('reset', email);
      await this.mailService.sendVerificationCode(
        email,
        code,
        '密码重置验证码',
      );
    }

    return {
      message: '如果该邮箱存在，验证码已发送',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.toLowerCase();
    await this.assertEmailCode('reset', email, dto.code);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new BadRequestException('验证码无效');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await this.deleteEmailCode('reset', email);
    return { message: '密码重置成功' };
  }

  private async initializeDefaultAdmin(): Promise<void> {
    const username = this.config.get<string>('ADMIN_USERNAME')?.trim();
    const email = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD');
    const displayName = this.config.get<string>('ADMIN_DISPLAY_NAME')?.trim();

    if (!username || !email || !password) {
      this.logger.warn(
        '未配置 ADMIN_USERNAME、ADMIN_EMAIL、ADMIN_PASSWORD，跳过默认管理员初始化',
      );
      return;
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
      select: { id: true },
    });

    if (existingUser) {
      this.logger.log('默认管理员账号已存在，跳过初始化');
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await this.prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        displayName: displayName || '系统管理员',
        role: UserRole.ADMIN,
      },
    });

    this.logger.log('默认管理员账号初始化完成');
  }

  private async saveEmailCode(purpose: 'register' | 'reset', email: string) {
    const code = this.generateCode();
    await this.redisService.set(
      this.emailCodeKey(purpose, email),
      code,
      CODE_TTL_SECONDS,
    );
    return code;
  }

  private async assertEmailCode(
    purpose: 'register' | 'reset',
    email: string,
    code: string,
  ) {
    const key = this.emailCodeKey(purpose, email);
    const savedCode = await this.redisService.get(key);

    if (!savedCode || savedCode !== code) {
      throw new BadRequestException('验证码无效或已过期');
    }
  }

  private deleteEmailCode(purpose: 'register' | 'reset', email: string) {
    return this.redisService.del(this.emailCodeKey(purpose, email));
  }

  private emailCodeKey(purpose: 'register' | 'reset', email: string) {
    return `email_code:${purpose}:${email}`;
  }

  private generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private createAuthResponse(user: {
    id: string;
    username: string;
    email: string | null;
    displayName: string | null;
    role: UserRole;
  }) {
    const payload: AuthUser = {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }
}
