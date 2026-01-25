'use client';

import Link from 'next/link';

const modules = [
  {
    id: 'logistics',
    name: '물류 관리',
    description: '발주, 재고, 입고 관리',
    icon: '📦',
    href: '/logistics',
    color: 'from-blue-500 to-blue-600',
    available: true,
  },
  {
    id: 'marketing',
    name: '마케팅',
    description: '광고, 프로모션 관리',
    icon: '📢',
    href: '/marketing',
    color: 'from-purple-500 to-purple-600',
    available: false,
  },
  {
    id: 'finance',
    name: '회계 / 정산',
    description: '매출, 정산, 비용 관리',
    icon: '💰',
    href: '/finance',
    color: 'from-green-500 to-green-600',
    available: false,
  },
  {
    id: 'analytics',
    name: '분석 / 리포트',
    description: '데이터 분석, 보고서',
    icon: '📊',
    href: '/analytics',
    color: 'from-orange-500 to-orange-600',
    available: false,
  },
];

export default function PortalPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Header */}
      <header className="py-8 px-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-white">FBL 통합 업무 시스템</h1>
          <p className="text-slate-400 mt-2">업무 영역을 선택하세요</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-8 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {modules.map((module) => (
              module.available ? (
                <Link
                  key={module.id}
                  href={module.href}
                  className="group relative bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-white/30 hover:bg-white/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
                >
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${module.color} flex items-center justify-center text-3xl mb-4 group-hover:scale-110 transition-transform`}>
                    {module.icon}
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">{module.name}</h2>
                  <p className="text-slate-400 text-sm">{module.description}</p>
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-6 h-6 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ) : (
                <div
                  key={module.id}
                  className="relative bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/5 opacity-50 cursor-not-allowed"
                >
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${module.color} flex items-center justify-center text-3xl mb-4 grayscale`}>
                    {module.icon}
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">{module.name}</h2>
                  <p className="text-slate-400 text-sm">{module.description}</p>
                  <span className="absolute top-4 right-4 text-xs px-2 py-1 bg-slate-700 text-slate-400 rounded-full">
                    준비중
                  </span>
                </div>
              )
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 px-8 border-t border-white/10">
        <div className="max-w-6xl mx-auto text-center text-slate-500 text-sm">
          FBL Management System
        </div>
      </footer>
    </div>
  );
}
