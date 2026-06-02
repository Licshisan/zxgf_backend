import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatProviderRegistry } from './providers/chat-provider.registry';
import { MockChatProvider } from './providers/mock-chat.provider';
import { OpenAIChatProvider } from './providers/openai-chat.provider';

@Module({
  imports: [AuthModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatProviderRegistry,
    MockChatProvider,
    OpenAIChatProvider,
  ],
})
export class ChatModule {}
