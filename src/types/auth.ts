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
  admin: ['logistics', 'marketing', 'finance', 'analytics'],  // 전체
  manager: ['logistics', 'marketing'],                         // 물류 + 마케팅
  logistics: ['logistics'],                                    // 물류만
  marketing: ['marketing'],                                    // 마케팅만
  finance: ['finance'],                                        // 회계만
  analytics: ['analytics'],                                    // 분석만
};
