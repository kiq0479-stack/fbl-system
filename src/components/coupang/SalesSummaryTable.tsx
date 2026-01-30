'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';

// ============================================================================
// 타입
// ============================================================================

interface SalesSummaryItem {
  vendorItemId: number;
  productName: string;
  sku: string | null;
  sales: {
    d7: number;
    d30: number;
    d60: number;
    d120: number;
  };
  source: string;
}

interface GroupedProduct {
  key: string;
  productName: string;
  sku: string | null;
  totalSales: { d7: number; d30: number; d60: number; d120: number };
  /** 소스별 판매량 (항상 3개 소스 포함) */
  bySource: Record<string, { d7: number; d30: number; d60: number; d120: number }>;
}

// ============================================================================
// 소스 설정 (항상 이 순서로 표시)
// ============================================================================

const ALL_SOURCES = [
  { key: 'naver', label: '네이버 스토어', emoji: '🟢', color: 'text-green-700', bg: 'bg-green-50' },
  { key: 'coupang_seller', label: '쿠팡 판매자', emoji: '📦', color: 'text-blue-700', bg: 'bg-blue-50' },
  { key: 'coupang_rocket', label: '쿠팡 로켓그로스', emoji: '🚀', color: 'text-purple-700', bg: 'bg-purple-50' },
];

const ZERO_SALES = { d7: 0, d30: 0, d60: 0, d120: 0 };

// ============================================================================
// 컴포넌트
// ============================================================================

export default function SalesSummaryTable() {
  const [data, setData] = useState<SalesSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [sourcesInfo, setSourcesInfo] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/sales/summary');
        const json = await res.json();
        if (json.success) {
          setData(json.data || []);
          setSourcesInfo(json.sources || {});
        } else {
          setError(json.error || '데이터 조회 실패');
        }
      } catch {
        setError('네트워크 오류');
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  // 상품 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, GroupedProduct>();

    for (const item of data) {
      const key = item.vendorItemId > 0
        ? `vid:${item.vendorItemId}`
        : `name:${item.productName}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          productName: item.productName,
          sku: item.sku,
          totalSales: { d7: 0, d30: 0, d60: 0, d120: 0 },
          bySource: {},
        });
      }

      const group = map.get(key)!;
      if (item.productName.length > group.productName.length) {
        group.productName = item.productName;
      }
      if (item.sku && !group.sku) group.sku = item.sku;

      // 총합
      group.totalSales.d7 += item.sales.d7;
      group.totalSales.d30 += item.sales.d30;
      group.totalSales.d60 += item.sales.d60;
      group.totalSales.d120 += item.sales.d120;

      // 소스별 합산
      const src = item.source;
      if (!group.bySource[src]) {
        group.bySource[src] = { d7: 0, d30: 0, d60: 0, d120: 0 };
      }
      group.bySource[src].d7 += item.sales.d7;
      group.bySource[src].d30 += item.sales.d30;
      group.bySource[src].d60 += item.sales.d60;
      group.bySource[src].d120 += item.sales.d120;
    }

    return Array.from(map.values()).sort((a, b) => b.totalSales.d30 - a.totalSales.d30);
  }, [data]);

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ─── 로딩/에러 ───
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="ml-3 text-slate-500">판매량 데이터를 불러오는 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
        ❌ {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-sm text-slate-500">총 상품 수</p>
          <p className="text-2xl font-bold text-slate-900">{grouped.length}</p>
        </div>
        {ALL_SOURCES.map(src => (
          <div key={src.key} className={`${src.bg} border border-slate-200 rounded-lg p-4`}>
            <p className={`text-sm ${src.color}`}>{src.emoji} {src.label}</p>
            <p className="text-2xl font-bold text-slate-900">{sourcesInfo[src.key] || 0}개</p>
          </div>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-medium text-slate-600 w-8"></th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">상품명</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600 whitespace-nowrap">7일</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600 whitespace-nowrap">30일</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600 whitespace-nowrap">60일</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600 whitespace-nowrap">120일</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => {
              const isExpanded = expandedKeys.has(group.key);

              return (
                <Fragment key={group.key}>
                  {/* 메인 행 — 항상 클릭 가능 */}
                  <tr
                    className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${
                      isExpanded ? 'bg-slate-50' : ''
                    }`}
                    onClick={() => toggleExpand(group.key)}
                  >
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block transition-transform text-xs ${isExpanded ? 'rotate-90' : ''}`}>
                        ▶
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{group.productName}</div>
                      {group.sku && (
                        <div className="text-xs text-slate-400 mt-0.5">SKU: {group.sku}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{group.totalSales.d7.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">{group.totalSales.d30.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{group.totalSales.d60.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{group.totalSales.d120.toLocaleString()}</td>
                  </tr>

                  {/* 펼침: 항상 3개 소스 행 표시 */}
                  {isExpanded && ALL_SOURCES.map((src) => {
                    const sales = group.bySource[src.key] || ZERO_SALES;
                    return (
                      <tr
                        key={`${group.key}-${src.key}`}
                        className={`${src.bg} border-b border-slate-100`}
                      >
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2">
                          <span className="pl-4 text-sm">
                            {src.emoji} {src.label}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-600">{sales.d7.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right font-mono font-medium text-slate-700">{sales.d30.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-600">{sales.d60.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-600">{sales.d120.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {grouped.length === 0 && (
          <div className="py-12 text-center text-slate-400">
            판매 데이터가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
