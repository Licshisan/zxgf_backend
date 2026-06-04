import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { LlmProviderOptions } from '../../shared/llm/llm-provider.interface';
import { LlmProviderRegistry } from '../../shared/llm/llm-provider.registry';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  createEmptyUserProfile,
  PROFILE_DIMENSIONS,
  ProfileDimensionValue,
  UserProfileData,
  UserProfilePatch,
} from './types/user-profile.type';

const MAX_EVIDENCE_COUNT = 8;

export interface ProfileConversationUpdateInput {
  conversation: {
    user: string;
    assistant: string;
  };
  currentProfile?: UserProfileData;
  options?: LlmProviderOptions;
}

export interface ProfileRecognitionResult {
  profile: UserProfileData;
  patch: UserProfilePatch;
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: LlmProviderRegistry,
  ) {}

  async getProfile(userId: string): Promise<UserProfileData> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.normalizeProfile(user.profile);
  }

  async updateProfile(
    userId: string,
    patch: UserProfilePatch,
  ): Promise<UserProfileData>;
  async updateProfile(
    userId: string,
    input: ProfileConversationUpdateInput,
  ): Promise<ProfileRecognitionResult>;
  async updateProfile(
    userId: string,
    input: UserProfilePatch | ProfileConversationUpdateInput,
  ): Promise<UserProfileData | ProfileRecognitionResult> {
    if (this.isConversationUpdateInput(input)) {
      return this.updateProfileFromConversation(userId, input);
    }

    const currentProfile = await this.getProfile(userId);
    const nextProfile = this.mergeProfile(currentProfile, input);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: nextProfile as unknown as Prisma.InputJsonValue,
      },
      select: { profile: true },
    });

    return this.normalizeProfile(user.profile);
  }

  private async updateProfileFromConversation(
    userId: string,
    input: ProfileConversationUpdateInput,
  ): Promise<ProfileRecognitionResult> {
    const currentProfile =
      input.currentProfile ?? (await this.getProfile(userId));
    const patch = await this.extractProfilePatch({
      profile: currentProfile,
      userText: input.conversation.user,
      assistantText: input.conversation.assistant,
      options: input.options ?? {},
    });

    if (!patch || Object.keys(patch).length === 0) {
      return {
        profile: currentProfile,
        patch: {},
      };
    }

    return {
      profile: await this.updateProfile(userId, patch),
      patch,
    };
  }

  private async extractProfilePatch(input: {
    profile: UserProfileData;
    userText: string;
    assistantText: string;
    options: LlmProviderOptions;
  }): Promise<UserProfilePatch | null> {
    const provider = this.providerRegistry.getProvider(input.options.provider);
    const events = provider.streamChat({
      messages: [
        {
          id: `profile_extract_system_${randomUUID()}`,
          role: 'system',
          content: this.getProfileExtractionPrompt(),
        },
        {
          id: `profile_extract_user_${randomUUID()}`,
          role: 'user',
          content: JSON.stringify({
            currentProfile: input.profile,
            conversation: {
              user: input.userText,
              assistant: input.assistantText,
            },
          }),
        },
      ],
      options: {
        ...input.options,
        temperature: 0,
        rag: { enabled: false },
        profile: { enabled: false, update: false },
      },
      signal: new AbortController().signal,
    });

    let content = '';
    for await (const event of events) {
      if (event.type === 'text-delta') {
        content += event.delta;
      }
    }

    return this.parseProfilePatch(content);
  }

  private getProfileExtractionPrompt(): string {
    return [
      '你需要根据最新一轮对话提取用户画像的增量更新。',
      '只返回严格 JSON 对象，不要使用 markdown，不要输出解释。',
      '允许的字段只有：learningLevel、goalClarity、interestDirection、communicationPreference、engagement、knowledgeWeakness。',
      '每个发生变化的字段必须包含：score 数字 0-100、label 字符串、summary 字符串、confidence 数字 0-1、evidence 字符串数组。',
      '只提取有明确对话证据支持的维度；没有可靠更新时返回 {}。',
      'label、summary、evidence 必须使用中文。',
    ].join('\n');
  }

  private parseProfilePatch(content: string): UserProfilePatch | null {
    const trimmed = content.trim();
    if (!trimmed) return null;

    const jsonText = this.extractJsonObject(trimmed);
    if (!jsonText) return null;

    try {
      const parsed = JSON.parse(jsonText) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private extractJsonObject(content: string): string | null {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }
    return content.slice(start, end + 1);
  }

  private isConversationUpdateInput(
    input: UserProfilePatch | ProfileConversationUpdateInput,
  ): input is ProfileConversationUpdateInput {
    return (
      typeof input === 'object' &&
      input !== null &&
      'conversation' in input &&
      typeof input.conversation === 'object' &&
      input.conversation !== null
    );
  }

  private mergeProfile(
    current: UserProfileData,
    patch: UserProfilePatch,
  ): UserProfileData {
    const merged: UserProfileData = { ...current };
    const updatedAt = new Date().toISOString();

    for (const dimension of PROFILE_DIMENSIONS) {
      if (!Object.prototype.hasOwnProperty.call(patch, dimension)) {
        continue;
      }

      const nextValue = this.normalizeDimensionValue(
        patch[dimension],
        updatedAt,
      );

      if (!nextValue) {
        merged[dimension] = null;
        continue;
      }

      const previousValue = current[dimension];
      merged[dimension] = {
        ...nextValue,
        evidence: this.mergeEvidence(
          previousValue?.evidence,
          nextValue.evidence,
        ),
        updatedAt,
      };
    }

    return merged;
  }

  private normalizeProfile(value: Prisma.JsonValue): UserProfileData {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return createEmptyUserProfile();
    }

    const empty = createEmptyUserProfile();
    const profile = value as Record<string, unknown>;

    for (const dimension of PROFILE_DIMENSIONS) {
      empty[dimension] = this.normalizeDimensionValue(profile[dimension]);
    }

    return empty;
  }

  private normalizeDimensionValue(
    value: unknown,
    fallbackUpdatedAt = new Date().toISOString(),
  ): ProfileDimensionValue | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const item = value as Partial<ProfileDimensionValue>;
    if (
      typeof item.score !== 'number' ||
      typeof item.label !== 'string' ||
      typeof item.summary !== 'string' ||
      typeof item.confidence !== 'number' ||
      !Array.isArray(item.evidence)
    ) {
      return null;
    }

    return {
      score: Math.max(0, Math.min(100, item.score)),
      label: item.label.trim(),
      summary: item.summary.trim(),
      confidence: Math.max(0, Math.min(1, item.confidence)),
      evidence: item.evidence.filter(
        (evidence): evidence is string =>
          typeof evidence === 'string' && evidence.trim().length > 0,
      ),
      updatedAt:
        typeof item.updatedAt === 'string' && item.updatedAt.trim()
          ? item.updatedAt
          : fallbackUpdatedAt,
    };
  }

  private mergeEvidence(
    previous: string[] = [],
    next: string[] = [],
  ): string[] {
    const evidence = [...previous, ...next]
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    return [...new Set(evidence)].slice(-MAX_EVIDENCE_COUNT);
  }
}
