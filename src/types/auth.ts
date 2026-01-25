export type UserRole = 'admin' | 'manager' | 'logistics' | 'marketing' | 'finance' | 'analytics';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  name: string;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

// 역할별 접근 가능한 모듈
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ['logistics', 'marketing', 'finance', 'analytics'],
  manager: ['logistics', 'marketing', 'finance', 'analytics'],
  logistics: ['logistics'],
  marketing: ['marketing'],
  finance: ['finance'],
  analytics: ['analytics'],
};
