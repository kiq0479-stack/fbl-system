'use client';

import { useState } from 'react';
import SellerDeliveryTable from '@/components/coupang/SellerDeliveryTable';
import RevenueTable from '@/components/coupang/RevenueTable';
import RocketGrowthOrderTable from '@/components/coupang/RocketGrowthOrderTable';
import StockSummaryTable from '@/components/coupang/StockSummaryTable';
import SalesSummaryTable from '@/components/coupang/SalesSummaryTable';

type CoupangTab = 'sales' | 'stock' | 'rocket' | 'revenue' | 'seller';

export default function CoupangPage() {
  const [activeTab, setActiveTab] = useState<CoupangTab>('sales');
  
  // 오늘 날짜
  const today = new Date().toISOString().split('T')[0];
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: today,
  });
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    
    try {
      const res = await fetch('/api/coupang/revenue/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: dateRange.from,
          to: dateRange.to,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSyncResult({ success: true, message: data.message });
      } else {
        setSyncResult({ success: false, message: data.error || '동기화 실패' });
      }
    } catch (error) {
      setSyncResult({ success: false, message: '네트워크 오류' });
    }
    
    setSyncing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">쿠팡 주문</h1>
          <p className="text-sm text-slate-500 mt-1">쿠팡 주문 및 매출 현황을 조회합니다.</p>
        </div>
        
        {activeTab !== 'stock' && activeTab !== 'sales' && (
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-400">~</span>
            <input
              type="date"
              value={dateRange.to}
              max={activeTab === 'revenue' ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0] : today}
              onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {activeTab === 'revenue' && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
            >
              {syncing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  동기화 중...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  DB 동기화
                </>
              )}
            </button>
          )}
          </div>
        )}
      </div>

      {syncResult && (
        <div className={`p-4 rounded-lg ${syncResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {syncResult.message}
        </div>
      )}

      {/* 탭 UI */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('sales')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'sales'
                ? 'border-rose-500 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            title="전체 채널 판매량 통합 조회 (쿠팡 로켓 + 판매자 + 네이버)"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              판매량
            </span>
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'stock'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            title="쿠팡 물류센터 재고 및 판매 현황"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              재고현황
            </span>
          </button>
          <button
            onClick={() => setActiveTab('rocket')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'rocket'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            title="결제일 기준 주문 조회 (취소 건 포함)"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              로켓그로스
              <span className="text-xs text-slate-400">(결제일 기준)</span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab('revenue')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'revenue'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            title="정산 기준 매출 조회 (취소 건 제외, 정확한 매출)"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              매출내역
              <span className="text-xs text-slate-400">(정산 기준)</span>
              <span className="inline-flex items-center justify-center w-4 h-4 bg-green-100 text-green-600 rounded-full text-[10px] font-bold" title="정확한 매출 데이터">✓</span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab('seller')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'seller'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            title="결제일 기준 판매자배송 주문 조회"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              판매자배송
              <span className="text-xs text-slate-400">(결제일 기준)</span>
            </span>
          </button>
        </nav>
      </div>

      {/* 테이블 */}
      {activeTab === 'sales' ? (
        <SalesSummaryTable />
      ) : activeTab === 'stock' ? (
        <StockSummaryTable />
      ) : activeTab === 'rocket' ? (
        <RocketGrowthOrderTable 
          from={dateRange.from} 
          to={dateRange.to} 
        />
      ) : activeTab === 'revenue' ? (
        <RevenueTable 
          from={dateRange.from} 
          to={dateRange.to} 
        />
      ) : (
        <SellerDeliveryTable 
          from={dateRange.from} 
          to={dateRange.to} 
        />
      )}
    </div>
  );
}
