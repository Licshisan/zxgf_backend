import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
  ) {}

  async sendRegisterCode(dto: SendEmailCodeDto) {
    const email = dto.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const code = await this.saveEmailCode('register', email);
    await this.mailService.sendVerificationCode(email, code, 'Register code');
    return { message: 'Verification code sent' };
  }

  async register(dto: RegisterDto) {
    const username = dto.username.trim();
    const email = dto.email.toLowerCase();

    await this.assertEmailCode('register', email, dto.code);

    const role = dto.role ?? UserRole.STUDENT;
    if (role === UserRole.ADMIN) {
      throw new BadRequestException('Admin registration is not allowed');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
    });
    if (existingUser) {
      throw new ConflictException('Username or email already exists');
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
      throw new UnauthorizedException('Invalid account or password');
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
      await this.mailService.sendVerificationCode(email, code, 'Password reset code');
    }

    return { message: 'If the email exists, a verification code has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.toLowerCase();
    await this.assertEmailCode('reset', email, dto.code);

    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new BadRequestException('Invalid verification code');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await this.deleteEmailCode('reset', email);
    return { message: 'Password reset successfully' };
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
      throw new BadRequestException('Invalid or expired verification code');
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
