'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_PERMISSIONS, UserRole } from '@/types/auth';

const modules = [
  {
    id: 'logistics',
    name: '물류 관리',
    description: '발주, 재고, 입고 관리',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    href: '/logistics',
    available: true,
  },
  {
    id: 'marketing',
    name: '마케팅',
    description: '광고, 프로모션 관리',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
    href: '/marketing',
    available: false,
  },
  {
    id: 'finance',
    name: '회계 / 정산',
    description: '매출, 정산, 비용 관리',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    href: '/finance',
    available: false,
  },
  {
    id: 'analytics',
    name: '분석 / 리포트',
    description: '데이터 분석, 보고서',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    href: '/analytics',
    available: false,
  },
];

export default function PortalPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  // 사용자 역할에 따른 접근 가능 모듈 확인
  const canAccess = (moduleId: string): boolean => {
    if (!user) return false;
    const permissions = ROLE_PERMISSIONS[user.role as UserRole];
    return permissions?.includes(moduleId) ?? false;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="pt-12 pb-8 px-8">
        <div className="max-w-4xl mx-auto">
          {/* User Info Bar */}
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-medium">
                {user?.name?.charAt(0) || '?'}
              </div>
              <div>
                <p className="font-medium text-gray-900">{user?.name || '사용자'}</p>
                <p className="text-sm text-gray-500">{user?.username}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              로그아웃
            </button>
          </div>

          {/* Title */}
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">FBL 통합 업무 시스템</h1>
            <p className="text-gray-500 mt-3 text-lg">업무 영역을 선택하세요</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-8 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {modules.map((module) => {
              const hasAccess = canAccess(module.id);
              const isAvailable = module.available && hasAccess;
              
              return isAvailable ? (
                <Link
                  key={module.id}
                  href={module.href}
                  className="group relative bg-white rounded-2xl p-8 border border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all duration-200"
                >
                  <div className="w-14 h-14 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    {module.icon}
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">{module.name}</h2>
                  <p className="text-gray-500 text-sm">{module.description}</p>
                  <div className="absolute top-8 right-8 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ) : (
                <div
                  key={module.id}
                  className="relative bg-gray-50 rounded-2xl p-8 border border-gray-100 cursor-not-allowed"
                >
                  <div className="w-14 h-14 rounded-xl bg-gray-100 text-gray-400 flex items-center justify-center mb-5">
                    {module.icon}
                  </div>
                  <h2 className="text-xl font-semibold text-gray-400 mb-2">{module.name}</h2>
                  <p className="text-gray-400 text-sm">{module.description}</p>
                  <span className="absolute top-6 right-6 text-xs px-3 py-1 bg-gray-200 text-gray-500 rounded-full font-medium">
                    {!module.available ? '준비중' : '권한 없음'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-8 border-t border-gray-100">
        <div className="max-w-4xl mx-auto text-center text-gray-400 text-sm">
          FBL Management System
        </div>
      </footer>
    </div>
  );
}
