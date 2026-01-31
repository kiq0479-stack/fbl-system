'use client';

import { useEffect, useState } from 'react';

interface StockItem {
  vendorItemId: number;
  productName: string;
  totalStock: number;
  availableStock: number;
  incomingStock: number;
  sales7d: number;
  sales30d: number;
  externalSkuId: string | null;
}

interface StockSummaryResponse {
  success: boolean;
  data: StockItem[];
  total: number;
  updatedAt: string;
}

export default function StockSummaryTable() {
  const [data, setData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'kidl' | 'cozi'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/coupang/stock-summary');
      const json: StockSummaryResponse = await res.json();
      
      if (json.success) {
        setData(json.data);
        setUpdatedAt(json.updatedAt);
      } else {
        setError('데이터를 불러오는데 실패했습니다.');
      }
    } catch (err) {
      setError('네트워크 오류가 발생했습니다.');
    }
    setLoading(false);
  };

  // 필터링
  const filteredData = data.filter(item => {
    const name = item.productName.toLowerCase();
    
    // 브랜드 필터
    if (filter === 'kidl' && !name.includes('키들')) return false;
    if (filter === 'cozi' && !name.includes('코지앤칠')) return false;
    
    // 검색어 필터
    if (search && !name.includes(search.toLowerCase())) return false;
    
    return true;
  });

  // 통계 계산
  const stats = {
    totalItems: filteredData.length,
    totalStock: filteredData.reduce((sum, item) => sum + item.totalStock, 0),
    total7dSales: filteredData.reduce((sum, item) => sum + item.sales7d, 0),
    total30dSales: filteredData.reduce((sum, item) => sum + item.sales30d, 0),
    lowStock: filteredData.filter(item => item.totalStock > 0 && item.totalStock < item.sales7d).length,
    outOfStock: filteredData.filter(item => item.totalStock === 0 && item.sales30d > 0).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-slate-500">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>재고 데이터 로딩 중...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
        <button onClick={fetchData} className="ml-4 text-red-600 underline">다시 시도</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase font-medium">총 상품</div>
          <div className="text-2xl font-bold text-slate-900">{stats.totalItems}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase font-medium">총 재고</div>
          <div className="text-2xl font-bold text-slate-900">{stats.totalStock.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase font-medium">7일 판매</div>
          <div className="text-2xl font-bold text-blue-600">{stats.total7dSales.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase font-medium">30일 판매</div>
          <div className="text-2xl font-bold text-purple-600">{stats.total30dSales.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase font-medium">재고 부족</div>
          <div className="text-2xl font-bold text-orange-600">{stats.lowStock}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase font-medium">품절</div>
          <div className="text-2xl font-bold text-red-600">{stats.outOfStock}</div>
        </div>
      </div>

      {/* 필터 & 검색 */}
      <div className="flex flex-wrap items-center gap-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'all' | 'kidl' | 'cozi')}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="all">전체</option>
          <option value="kidl">키들</option>
          <option value="cozi">코지앤칠</option>
        </select>
        
        <input
          type="text"
          placeholder="상품명 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          새로고침
        </button>
        
        {updatedAt && (
          <span className="text-xs text-slate-400">
            업데이트: {new Date(updatedAt).toLocaleString('ko-KR')}
          </span>
        )}
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm bg-white">
        <table className="w-full text-left text-sm min-w-[600px]">
          <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold text-xs border-b border-slate-200">
            <tr>
              <th className="px-3 sm:px-6 py-2 sm:py-4 min-w-[120px]">상품명</th>
              <th className="px-2 sm:px-6 py-2 sm:py-4 text-right">총합</th>
              <th className="px-2 sm:px-6 py-2 sm:py-4 text-right hidden sm:table-cell">판매가능</th>
              <th className="px-2 sm:px-6 py-2 sm:py-4 text-right hidden sm:table-cell">입고예정</th>
              <th className="px-2 sm:px-6 py-2 sm:py-4 text-right">
                <div>7일</div>
              </th>
              <th className="px-2 sm:px-6 py-2 sm:py-4 text-right">30일</th>
              <th className="px-2 sm:px-6 py-2 sm:py-4 text-center">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 sm:px-6 py-12 text-center text-slate-400">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              filteredData.map((item) => {
                // 상태 계산
                let status = 'normal';
                let statusText = '정상';
                let statusColor = 'bg-green-100 text-green-800';
                
                if (item.totalStock === 0 && item.sales30d > 0) {
                  status = 'outOfStock';
                  statusText = '품절';
                  statusColor = 'bg-red-100 text-red-800';
                } else if (item.totalStock > 0 && item.totalStock < item.sales7d) {
                  status = 'low';
                  statusText = '부족';
                  statusColor = 'bg-orange-100 text-orange-800';
                } else if (item.totalStock === 0 && item.sales30d === 0) {
                  status = 'noSales';
                  statusText = '-';
                  statusColor = 'bg-slate-100 text-slate-500';
                }

                return (
                  <tr key={item.vendorItemId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 sm:px-6 py-2 sm:py-4">
                      <div className="font-medium text-slate-900 break-keep" title={item.productName}>
                        {item.productName}
                      </div>
                      {item.externalSkuId && (
                        <div className="text-xs text-slate-400 mt-0.5">SKU: {item.externalSkuId}</div>
                      )}
                    </td>
                    <td className="px-2 sm:px-6 py-2 sm:py-4 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {item.totalStock.toLocaleString()}
                    </td>
                    <td className="px-2 sm:px-6 py-2 sm:py-4 text-right tabular-nums text-slate-600 whitespace-nowrap hidden sm:table-cell">
                      {item.availableStock.toLocaleString()}
                    </td>
                    <td className="px-2 sm:px-6 py-2 sm:py-4 text-right tabular-nums text-slate-400 whitespace-nowrap hidden sm:table-cell">
                      {item.incomingStock > 0 ? item.incomingStock.toLocaleString() : '-'}
                    </td>
                    <td className="px-2 sm:px-6 py-2 sm:py-4 text-right tabular-nums text-blue-600 font-medium whitespace-nowrap">
                      {item.sales7d > 0 ? item.sales7d.toLocaleString() : '-'}
                    </td>
                    <td className="px-2 sm:px-6 py-2 sm:py-4 text-right tabular-nums text-purple-600 font-medium whitespace-nowrap">
                      {item.sales30d > 0 ? item.sales30d.toLocaleString() : '-'}
                    </td>
                    <td className="px-2 sm:px-6 py-2 sm:py-4 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                        {statusText}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
