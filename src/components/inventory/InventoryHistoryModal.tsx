'use client';

import { useState, useEffect } from 'react';

interface InventoryLog {
  id: string;
  inventory_id: string;
  change_type: string;
  change_type_label: string;
  change_qty: number;
  reason: string | null;
  reference_type: string | null;
  reference_type_label: string | null;
  reference_id: string | null;
  created_at: string;
}

interface InventoryHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventoryId: string;
  productName: string;
  currentQuantity: number;
  location: string;
}

export default function InventoryHistoryModal({
  isOpen,
  onClose,
  inventoryId,
  productName,
  currentQuantity,
  location,
}: InventoryHistoryModalProps) {
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(7);

  useEffect(() => {
    if (isOpen && inventoryId) {
      fetchLogs();
    }
  }, [isOpen, inventoryId, days]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/logs?inventory_id=${inventoryId}&days=${days}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('이력 조회 실패:', error);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  const locationLabel = location === 'warehouse' ? '창고' : location === 'coupang' ? '쿠팡' : location;

  // 변동 합계 계산
  const totalChange = logs.reduce((sum, log) => sum + log.change_qty, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">재고 변동 이력</h2>
              <p className="text-sm text-slate-500 mt-0.5">{productName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 요약 */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex-shrink-0">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-slate-500 uppercase">위치</div>
              <div className="text-lg font-semibold text-slate-900">{locationLabel}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase">현재 수량</div>
              <div className="text-lg font-semibold text-slate-900">{currentQuantity.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase">{days}일 변동</div>
              <div className={`text-lg font-semibold ${totalChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalChange >= 0 ? '+' : ''}{totalChange.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* 기간 선택 */}
        <div className="px-6 py-3 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">조회 기간:</span>
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  days === d
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {d}일
              </button>
            ))}
          </div>
        </div>

        {/* 이력 목록 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-12 h-12 mx-auto text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-slate-500">최근 {days}일간 변동 이력이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-4 p-3 bg-slate-50 rounded-lg"
                >
                  {/* 변동 아이콘 */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                    log.change_qty > 0 
                      ? 'bg-green-100 text-green-600' 
                      : 'bg-red-100 text-red-600'
                  }`}>
                    {log.change_qty > 0 ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    )}
                  </div>

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${
                        log.change_qty > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {log.change_qty > 0 ? '+' : ''}{log.change_qty.toLocaleString()}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded">
                        {log.change_type_label}
                      </span>
                      {log.reference_type_label && (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded">
                          {log.reference_type_label}
                        </span>
                      )}
                    </div>
                    {log.reason && (
                      <p className="text-sm text-slate-600 mt-1 truncate">{log.reason}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(log.created_at).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-slate-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
