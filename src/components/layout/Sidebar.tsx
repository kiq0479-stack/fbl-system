'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const SidebarItem = ({ 
  href, 
  children, 
  icon,
  onClick
}: { 
  href: string; 
  children: ReactNode; 
  icon: ReactNode;
  onClick?: () => void;
}) => {
  const pathname = usePathname();
  const isActive = href === '/logistics' 
    ? pathname === '/logistics' 
    : pathname.startsWith(href);

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors duration-200 rounded-lg mx-2 mb-1 ${
        isActive 
          ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20' 
          : 'text-slate-400 hover:text-white hover:bg-slate-800'
      }`}
    >
      <span className="w-5 h-5">{icon}</span>
      {children}
    </Link>
  );
};

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <>
      {/* 모바일 오버레이 */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* 사이드바 */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full shrink-0
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-600 rounded-lg mr-3 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-white font-bold text-lg tracking-tight">FBL Logistics</span>
          </div>
          {/* 모바일 닫기 버튼 */}
          <button 
            onClick={onClose}
            className="lg:hidden p-2 text-slate-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 py-6 overflow-y-auto">
          <div className="px-6 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Main Menu
          </div>
          
          <SidebarItem href="/logistics" onClick={onClose} icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          }>
            대시보드
          </SidebarItem>

          <SidebarItem href="/logistics/products" onClick={onClose} icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }>
            상품 관리
          </SidebarItem>

          <SidebarItem href="/logistics/supplies" onClick={onClose} icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }>
            부자재 관리
          </SidebarItem>

          <SidebarItem href="/logistics/inventory" onClick={onClose} icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
               <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          }>
            재고 관리
          </SidebarItem>

          <SidebarItem href="/logistics/orders" onClick={onClose} icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
               <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }>
            발주 관리
          </SidebarItem>

          <div className="px-6 mt-8 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            물류작업
          </div>

          <SidebarItem href="/logistics/inbound" onClick={onClose} icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293h3.172a1 1 0 00.707-.293l2.414-2.414a1 1 0 01.707-.293H20" />
            </svg>
          }>
            입고 관리
          </SidebarItem>

          {/* 마켓플레이스 - admin만 표시 */}
          {isAdmin && (
            <>
              <div className="px-6 mt-8 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                마켓플레이스
              </div>

              <SidebarItem href="/logistics/coupang" onClick={onClose} icon={
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              }>
                쿠팡 주문
              </SidebarItem>
            </>
          )}

          <div className="px-6 mt-8 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            System
          </div>

          <SidebarItem href="/logistics/settings" onClick={onClose} icon={
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }>
            설정
          </SidebarItem>
        </div>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
              {user?.name?.charAt(0) || '?'}
            </div>
            <div>
              <div className="text-sm font-medium text-white">{user?.name || '사용자'}</div>
              <div className="text-xs text-slate-500">{user?.username || ''}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
