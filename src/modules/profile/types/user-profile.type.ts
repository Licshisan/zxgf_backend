export const PROFILE_DIMENSIONS = [
  'learningLevel',
  'goalClarity',
  'interestDirection',
  'communicationPreference',
  'engagement',
  'knowledgeWeakness',
] as const;

export type ProfileDimension = (typeof PROFILE_DIMENSIONS)[number];

export interface ProfileDimensionValue {
  score: number;
  label: string;
  summary: string;
  confidence: number;
  evidence: string[];
  updatedAt: string;
}

export type UserProfileData = Record<
  ProfileDimension,
  ProfileDimensionValue | null
>;

export function createEmptyUserProfile(): UserProfileData {
  return PROFILE_DIMENSIONS.reduce((profile, dimension) => {
    profile[dimension] = null;
    return profile;
  }, {} as UserProfileData);
}
