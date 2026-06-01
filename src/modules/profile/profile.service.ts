import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  createEmptyUserProfile,
  PROFILE_DIMENSIONS,
  type ProfileDimensionValue,
  type UserProfileData,
} from './types/user-profile.type';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

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
    profile: UserProfileData,
  ): Promise<UserProfileData> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: profile as unknown as Prisma.InputJsonValue,
      },
      select: { profile: true },
    });

    return this.normalizeProfile(user.profile);
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
      !Array.isArray(item.evidence) ||
      typeof item.updatedAt !== 'string'
    ) {
      return null;
    }

    return {
      score: Math.max(0, Math.min(100, item.score)),
      label: item.label,
      summary: item.summary,
      confidence: Math.max(0, Math.min(1, item.confidence)),
      evidence: item.evidence.filter(
        (evidence): evidence is string => typeof evidence === 'string',
      ),
      updatedAt: item.updatedAt,
    };
  }
}
