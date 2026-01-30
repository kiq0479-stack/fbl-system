'use client';

import { Fragment, useEffect, useState } from 'react';

interface ForecastItem {
  product_id: string;
  sku: string;
  name: string;
  category: string;
  warehouse_qty: number;
  coupang_qty: number;
  total_qty: number;
  sales_7d: number;
  sales_30d: number;
  sales_40d: number;
  sales_60d: number;
  sales_90d: number;
  sales_120d: number;
  need_60d: number;
  need_90d: number;
  need_120d: number;
  coupang_need_40d: number;
  stockout_risk: boolean;
}

interface ForecastResponse {
  success: boolean;
  items: ForecastItem[];
  categories: string[];
  summary: {
    total: number;
    at_risk: number;
  };
  generated_at: string;
}

export default function ForecastPage() {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 필터
  const [category, setCategory] = useState<string>('all');
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleItem = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchForecast = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      if (onlyRisk) params.set('only_risk', 'true');
      
      const res = await fetch(`/api/forecast?${params.toString()}`);
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error || '데이터 조회 실패');
      }
      
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast();
  }, [onlyRisk]);

  // 검색 필터
  const filteredItems = data?.items.filter(item => {
    if (!search) return true;
    const s = search.toLowerCase();
    return item.name.toLowerCase().includes(s) || item.sku.toLowerCase().includes(s);
  }) || [];

  // 카테고리별 그룹핑
  const groupedByCategory = filteredItems.reduce((acc, item) => {
    const cat = item.category || '미분류';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, ForecastItem[]>);

  // 엑셀 다운로드
  const handleExcelDownload = () => {
    if (!data?.items.length) return;
    
    // CSV 형식으로 생성
    const headers = [
      '카테고리', '상품명', 'SKU', '총수량', '창고', '쿠팡',
      '7일', '30일', '60일', '90일', '120일',
      '60일필요', '90일필요', '120일필요', '쿠팡40일필요', '품절위험'
    ];
    
    const rows = filteredItems.map(item => [
      item.category,
      item.name,
      item.sku,
      item.total_qty,
      item.warehouse_qty,
      item.coupang_qty,
      item.sales_7d,
      item.sales_30d,
      item.sales_60d,
      item.sales_90d,
      item.sales_120d,
      item.need_60d,
      item.need_90d,
      item.need_120d,
      item.coupang_need_40d,
      item.stockout_risk ? 'O' : ''
    ]);
    
    // BOM + CSV
    const BOM = '\uFEFF';
    const csvContent = BOM + [headers, ...rows].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `발주표_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 숫자 포맷 (음수는 빨간색)
  const formatNumber = (num: number, highlight: boolean = false) => {
    if (num === 0) return '-';
    const formatted = num.toLocaleString();
    if (highlight && num < 0) {
      return <span className="text-red-600 font-semibold">{formatted}</span>;
    }
    return formatted;
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">발주 수요 예측</h1>
          <p className="text-sm text-slate-500 mt-1">
            판매량 기반 재고 예측 및 발주 필요량 계산
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={fetchForecast}
            disabled={loading}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors text-sm font-medium flex items-center gap-1.5"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                새로고침 중...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                새로고침
              </>
            )}
          </button>
          <button
            onClick={handleExcelDownload}
            disabled={!data?.items.length}
            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400 transition-colors text-sm font-medium flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            엑셀 다운로드
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-sm text-slate-500">총 상품</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{data.summary.total}</div>
          </div>
          <div className={`p-4 rounded-xl border ${data.summary.at_risk > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
            <div className={`text-sm ${data.summary.at_risk > 0 ? 'text-red-600' : 'text-slate-500'}`}>품절 위험</div>
            <div className={`text-2xl font-bold mt-1 ${data.summary.at_risk > 0 ? 'text-red-700' : 'text-slate-900'}`}>
              {data.summary.at_risk}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-sm text-slate-500">카테고리</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{data.categories.length}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-sm text-slate-500">마지막 갱신</div>
            <div className="text-lg font-semibold text-slate-700 mt-1">
              {new Date(data.generated_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <input
            type="text"
            placeholder="상품명, SKU 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 p-2">✕</button>
          )}
        </div>

        <label className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg cursor-pointer hover:bg-slate-200 transition-colors">
          <input
            type="checkbox"
            checked={onlyRisk}
            onChange={(e) => setOnlyRisk(e.target.checked)}
            className="w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500"
          />
          <span className="text-sm font-medium text-slate-700">품절 위험만</span>
        </label>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          <div className="font-medium">오류 발생</div>
          <div className="text-sm mt-1">{error}</div>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          <div className="text-slate-500 mt-4">데이터 로딩 중...</div>
        </div>
      )}

      {/* 상품 리스트 */}
      {!loading && data && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-12 text-center text-slate-400">
              {search ? '검색 결과가 없습니다' : '데이터가 없습니다'}
            </div>
          ) : (
            filteredItems.map(item => {
              const isItemExpanded = expandedItems.has(item.product_id);
              return (
                <div key={item.product_id} className={item.stockout_risk ? 'bg-red-50/50' : ''}>
                  {/* 상품 행 */}
                  <button
                    type="button"
                    onClick={() => toggleItem(item.product_id)}
                    className={`w-full px-4 py-3 flex items-start gap-2 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors ${isItemExpanded ? 'bg-slate-50' : ''}`}
                    aria-expanded={isItemExpanded}
                  >
                    <span className={`inline-block transition-transform text-xs mt-0.5 shrink-0 text-slate-400 ${isItemExpanded ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900">{item.name}</div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                        <span>재고 <strong className="text-slate-700">{item.total_qty}</strong></span>
                        <span>7일 <strong className="text-slate-700">{item.sales_7d}</strong></span>
                        <span>30일 <strong className="text-slate-700">{item.sales_30d}</strong></span>
                        {item.stockout_risk && (
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-xs font-bold">위험</span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* 펼침: 상세 정보 카드 */}
                  {isItemExpanded && (
                    <div className="px-4 pb-4 pt-1">
                      <div className="ml-5 bg-slate-50 rounded-lg p-3 space-y-3 text-sm">
                        {/* 재고 */}
                        <div>
                          <div className="font-medium text-slate-600 mb-1.5">📦 재고</div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="flex justify-between"><span className="text-slate-500">총수량</span><span className="font-semibold">{formatNumber(item.total_qty)}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">창고</span><span className="font-medium">{formatNumber(item.warehouse_qty)}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">쿠팡</span><span className="font-medium">{formatNumber(item.coupang_qty)}</span></div>
                          </div>
                        </div>
                        {/* 판매량 */}
                        <div>
                          <div className="font-medium text-slate-600 mb-1.5">📊 판매량</div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="flex justify-between"><span className="text-slate-500">7일</span><span>{formatNumber(item.sales_7d)}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">30일</span><span>{formatNumber(item.sales_30d)}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">60일</span><span className="font-medium">{formatNumber(item.sales_60d)}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">90일</span><span>{formatNumber(item.sales_90d)}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">120일</span><span>{formatNumber(item.sales_120d)}</span></div>
                          </div>
                        </div>
                        {/* 필요 재고 */}
                        <div>
                          <div className="font-medium text-slate-600 mb-1.5">🔔 필요 재고</div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex justify-between"><span className="text-slate-500">60일</span>{formatNumber(item.need_60d, true)}</div>
                            <div className="flex justify-between"><span className="text-slate-500">90일</span>{formatNumber(item.need_90d, true)}</div>
                            <div className="flex justify-between"><span className="text-slate-500">120일</span>{formatNumber(item.need_120d, true)}</div>
                            <div className="flex justify-between"><span className="text-slate-500">쿠팡40일</span>{formatNumber(item.coupang_need_40d, true)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 범례 */}
      <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
        <div className="font-medium text-slate-700 mb-2">범례</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
          <div><span className="font-medium">총수량</span>: 창고 + 쿠팡 재고</div>
          <div><span className="font-medium">N일 판매량</span>: 최근 N일간 출고 수량</div>
          <div><span className="font-medium">N일 필요재고</span>: 총수량 - N일 판매량</div>
          <div><span className="font-medium">쿠팡40일</span>: 40일 판매량 - 쿠팡재고</div>
          <div><span className="text-red-600 font-medium">음수</span>: 발주 필요</div>
          <div><span className="inline-flex items-center justify-center w-5 h-5 bg-red-100 text-red-600 rounded-full font-bold text-xs mr-1">O</span> 품절 위험 (60일/90일 부족)</div>
        </div>
      </div>
    </div>
  );
}
