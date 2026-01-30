'use client';

import { useState, useMemo } from 'react';
import NaverOrderTable from '@/components/naver/NaverOrderTable';

export default function NaverPage() {
  // 오늘 날짜
  const today = new Date().toISOString().split('T')[0];
  const [dateRange, setDateRange] = useState({
    from: today,
    to: today,
  });
  
  // 재고 동기화 상태
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    details?: { synced: number; skipped: number; failed: number };
  } | null>(null);

  // 선택된 기간의 일수 계산
  const dayCount = useMemo(() => {
    const from = new Date(dateRange.from);
    const to = new Date(dateRange.to);
    return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [dateRange.from, dateRange.to]);

  // 빠른 날짜 선택 옵션
  const quickDateOptions = [
    { label: '오늘', days: 0 },
    { label: '최근 7일', days: 6 },
    { label: '최근 14일', days: 13 },
    { label: '최근 30일', days: 29 },
    { label: '이번 달', days: 'thisMonth' as const },
  ];

  const handleQuickDate = (option: typeof quickDateOptions[number]) => {
    const to = new Date();
    let from: Date;
    
    if (option.days === 'thisMonth') {
      from = new Date(to.getFullYear(), to.getMonth(), 1);
    } else {
      from = new Date(to);
      from.setDate(to.getDate() - (option.days as number));
    }
    
    setDateRange({
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
    });
  };

  // 재고 동기화 실행
  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    
    try {
      const res = await fetch('/api/sync/naver-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateRange.from,
          type: 'manual',
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSyncResult({
          success: true,
          message: `${data.syncDate} 동기화 완료`,
          details: {
            synced: data.summary.synced,
            skipped: data.summary.skipped,
            failed: data.summary.failed,
          },
        });
      } else {
        setSyncResult({
          success: false,
          message: data.error || '동기화 실패',
        });
      }
    } catch (error) {
      setSyncResult({
        success: false,
        message: '네트워크 오류가 발생했습니다.',
      });
    }
    
    setSyncing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">네이버 주문</h1>
          <p className="text-sm text-slate-500 mt-1">네이버 스마트스토어 주문 현황을 조회합니다.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* 빠른 날짜 선택 버튼 */}
          <div className="flex flex-wrap gap-2">
            {quickDateOptions.map((option) => (
              <button
                key={option.label}
                onClick={() => handleQuickDate(option)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {option.label}
              </button>
            ))}
          </div>
          
          {/* 날짜 선택 */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateRange.from}
              max={dateRange.to}
              onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <span className="text-slate-400">~</span>
            <input
              type="date"
              value={dateRange.to}
              min={dateRange.from}
              max={today}
              onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
      </div>

      {/* 기간 안내 메시지 */}
      {dayCount > 1 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>{dayCount}일</strong> 기간의 주문을 조회합니다. 
            {dayCount > 7 && ' 조회에 시간이 걸릴 수 있습니다.'}
          </p>
        </div>
      )}

      {dayCount > 31 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">
            <strong>주의:</strong> 최대 31일까지만 조회 가능합니다. 기간을 줄여주세요.
          </p>
        </div>
      )}

      {/* 재고 동기화 섹션 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">재고 동기화</h3>
            <p className="text-xs text-slate-500 mt-1">
              선택한 날짜({dateRange.from})의 주문을 창고 재고에 반영합니다.
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing || dayCount > 1}
            className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
          >
            {syncing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                동기화 중...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                재고 동기화
              </>
            )}
          </button>
        </div>
        
        {dayCount > 1 && (
          <p className="text-xs text-amber-600 mt-2">
            * 재고 동기화는 단일 날짜만 지원합니다. 시작일과 종료일을 같게 설정하세요.
          </p>
        )}
        
        {syncResult && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${
            syncResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            <p className="font-medium">{syncResult.message}</p>
            {syncResult.details && (
              <p className="text-xs mt-1">
                동기화: {syncResult.details.synced}건 | 
                스킵: {syncResult.details.skipped}건 | 
                실패: {syncResult.details.failed}건
              </p>
            )}
          </div>
        )}
      </div>

      <NaverOrderTable 
        from={dateRange.from} 
        to={dateRange.to} 
      />
    </div>
  );
}
