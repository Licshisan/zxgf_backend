import { UserRole } from '@prisma/client';

export type AuthUser = {
  sub: string;
  username: string;
  email: string | null;
  role: UserRole;
};
