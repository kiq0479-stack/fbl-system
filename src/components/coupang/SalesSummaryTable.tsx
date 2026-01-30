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
    d90: number;
    d120: number;
  };
  source: string;
  accountName?: string;
}

interface GroupedProduct {
  /** 그룹 키 (vendorItemId 또는 productName) */
  key: string;
  productName: string;
  sku: string | null;
  /** 소스별 합산 판매량 */
  totalSales: { d7: number; d30: number; d60: number; d90: number; d120: number };
  /** 소스별 상세 내역 */
  sources: SalesSummaryItem[];
}

// ============================================================================
// 소스 라벨/색상
// ============================================================================

const SOURCE_LABELS: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  coupang_rocket: {
    label: '쿠팡 로켓그로스',
    emoji: '🚀',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
  },
  coupang_seller: {
    label: '쿠팡 판매자배송',
    emoji: '📦',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
  },
  naver: {
    label: '네이버 스마트스토어',
    emoji: '🟢',
    color: 'text-green-700',
    bg: 'bg-green-50',
  },
};

function getSourceInfo(source: string) {
  return SOURCE_LABELS[source] || { label: source, emoji: '❓', color: 'text-slate-700', bg: 'bg-slate-50' };
}

// ============================================================================
// 컴포넌트
// ============================================================================

export default function SalesSummaryTable() {
  const [data, setData] = useState<SalesSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [sourcesInfo, setSourcesInfo] = useState<Record<string, number>>({});

  // 데이터 로드
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
      } catch (err) {
        setError('네트워크 오류');
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  // 상품 그룹핑: 같은 vendorItemId 또는 productName으로 묶기
  const grouped = useMemo(() => {
    const map = new Map<string, GroupedProduct>();

    for (const item of data) {
      // 키: vendorItemId > 0이면 vendorItemId 기준, 아니면 productName 기준
      const key = item.vendorItemId > 0
        ? `vid:${item.vendorItemId}`
        : `name:${item.productName}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          productName: item.productName,
          sku: item.sku,
          totalSales: { d7: 0, d30: 0, d60: 0, d90: 0, d120: 0 },
          sources: [],
        });
      }

      const group = map.get(key)!;
      // 상품명: 더 긴 이름 우선
      if (item.productName.length > group.productName.length) {
        group.productName = item.productName;
      }
      if (item.sku && !group.sku) {
        group.sku = item.sku;
      }
      // 소스별 판매량 합산
      group.totalSales.d7 += item.sales.d7;
      group.totalSales.d30 += item.sales.d30;
      group.totalSales.d60 += item.sales.d60;
      group.totalSales.d90 += item.sales.d90;
      group.totalSales.d120 += item.sales.d120;
      group.sources.push(item);
    }

    // d30 기준 내림차순 정렬
    return Array.from(map.values()).sort((a, b) => b.totalSales.d30 - a.totalSales.d30);
  }, [data]);

  // 토글
  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // 추세 표시
  function getTrend(d7: number, d30: number): { icon: string; color: string } {
    if (d30 === 0) return { icon: '—', color: 'text-slate-400' };
    const weeklyAvg = d30 / 4.3; // 30일 주간 평균
    if (d7 > weeklyAvg * 1.3) return { icon: '📈', color: 'text-green-600' };
    if (d7 < weeklyAvg * 0.7) return { icon: '📉', color: 'text-red-600' };
    return { icon: '➡️', color: 'text-slate-600' };
  }

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

  // ─── 메인 렌더 ───
  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-sm text-slate-500">총 상품 수</p>
          <p className="text-2xl font-bold text-slate-900">{grouped.length}</p>
        </div>
        {Object.entries(sourcesInfo).map(([source, count]) => {
          const info = getSourceInfo(source);
          return (
            <div key={source} className={`${info.bg} border border-slate-200 rounded-lg p-4`}>
              <p className={`text-sm ${info.color}`}>{info.emoji} {info.label}</p>
              <p className="text-2xl font-bold text-slate-900">{count}개</p>
            </div>
          );
        })}
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
              <th className="text-center px-4 py-3 font-medium text-slate-600 whitespace-nowrap">추세</th>
              <th className="text-center px-4 py-3 font-medium text-slate-600 whitespace-nowrap">소스</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => {
              const isExpanded = expandedKeys.has(group.key);
              const trend = getTrend(group.totalSales.d7, group.totalSales.d30);
              const hasMultipleSources = group.sources.length > 1;

              return (
                <Fragment key={group.key}>
                  {/* 메인 행 */}
                  <tr
                    className={`border-b border-slate-100 transition-colors ${
                      hasMultipleSources ? 'cursor-pointer hover:bg-slate-50' : ''
                    } ${isExpanded ? 'bg-slate-50' : ''}`}
                    onClick={() => hasMultipleSources && toggleExpand(group.key)}
                  >
                    <td className="px-4 py-3 text-center">
                      {hasMultipleSources && (
                        <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                          ▶
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {group.productName}
                      </div>
                      {group.sku && (
                        <div className="text-xs text-slate-400 mt-0.5">SKU: {group.sku}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{group.totalSales.d7.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">{group.totalSales.d30.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{group.totalSales.d60.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{group.totalSales.d120.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-center ${trend.color}`}>{trend.icon}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {group.sources.map((s, i) => (
                          <span
                            key={i}
                            title={`${getSourceInfo(s.source).label}${s.accountName ? ` (${s.accountName})` : ''}`}
                          >
                            {getSourceInfo(s.source).emoji}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>

                  {/* 확장 행: 소스별 상세 */}
                  {isExpanded && group.sources.map((source, idx) => {
                    const info = getSourceInfo(source.source);
                    return (
                      <tr
                        key={`${group.key}-${idx}`}
                        className={`${info.bg} border-b border-slate-100`}
                      >
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2 pl-4">
                            <span>{info.emoji}</span>
                            <span className={`text-sm font-medium ${info.color}`}>
                              {info.label}
                            </span>
                            {source.accountName && (
                              <span className="text-xs text-slate-400">({source.accountName})</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-600">{source.sales.d7.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right font-mono font-medium text-slate-700">{source.sales.d30.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-600">{source.sales.d60.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-600">{source.sales.d120.toLocaleString()}</td>
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2"></td>
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
