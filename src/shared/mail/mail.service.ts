import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const user = config.get<string>('SMTP_USER');
    this.from =
      config.get<string>('SMTP_FROM') || user || 'no-reply@example.com';

    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST', 'localhost'),
      port: config.get<number>('SMTP_PORT', 25),
      secure: config.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: user
        ? {
            user,
            pass: config.get<string>('SMTP_PASS'),
          }
        : undefined,
    });
  }

  async sendVerificationCode(to: string, code: string, subject: string) {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
    });

    this.logger.log(`Verification code email sent to ${to}`);
  }
}
