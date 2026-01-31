'use client';

import { useState, useEffect } from 'react';

interface RevenueItemData {
  orderId: number | string;
  saleType: string;
  saleDate: string;
  recognitionDate: string;
  settlementDate: string;
  items: {
    productName: string;
    vendorItemName: string;
    salePrice: number;
    saleAmount: number;
    quantity: number;
    settlementAmount: number;
    serviceFee: number;
    serviceFeeVat: number;
  }[];
}

interface RevenueTableProps {
  from: string;
  to: string;
}

export default function RevenueTable({ from, to }: RevenueTableProps) {
  const [revenues, setRevenues] = useState<RevenueItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRevenue = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // 매출내역은 어제까지만 조회 가능
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const adjustedTo = to > yesterday ? yesterday : to;
        
        // 매출내역 API 호출 (매출인식일 기준)
        const res = await fetch(`/api/coupang/revenue?from=${from}&to=${adjustedTo}`);
        const data = await res.json();
        
        if (data.error) {
          setError(data.error);
          setRevenues([]);
        } else {
          setRevenues(data.data || []);
        }
      } catch (err) {
        setError('매출내역을 불러오는데 실패했습니다.');
        setRevenues([]);
      }
      
      setLoading(false);
    };

    fetchRevenue();
  }, [from, to]);

  // 총 매출 계산
  const totalSales = revenues.reduce((sum, rev) => {
    return sum + rev.items.reduce((itemSum, item) => itemSum + (item.saleAmount || item.salePrice * item.quantity), 0);
  }, 0);

  const totalSettlement = revenues.reduce((sum, rev) => {
    return sum + rev.items.reduce((itemSum, item) => itemSum + item.settlementAmount, 0);
  }, 0);

  const totalFee = revenues.reduce((sum, rev) => {
    return sum + rev.items.reduce((itemSum, item) => itemSum + (item.serviceFee + (item.serviceFeeVat || 0)), 0);
  }, 0);

  if (loading) {
    return (
      <div className="w-full bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 text-center text-slate-500">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-slate-100 rounded w-full"></div>
            <div className="h-8 bg-slate-100 rounded w-5/6 mx-auto"></div>
            <div className="h-8 bg-slate-100 rounded w-4/6 mx-auto"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-white rounded-lg border border-red-200 shadow-sm p-8 text-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (revenues.length === 0) {
    return (
      <div className="w-full bg-white rounded-lg border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-slate-500">
        <svg className="w-12 h-12 mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-lg font-medium">매출내역이 없습니다.</p>
        <p className="text-sm mt-1">해당 기간에 매출인식된 주문이 없습니다.</p>
        <p className="text-xs mt-2 text-slate-400">* 매출내역은 어제까지의 데이터만 조회 가능합니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <p className="text-sm text-slate-500">총 매출액</p>
          <p className="text-2xl font-bold text-slate-900">{totalSales.toLocaleString()}원</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <p className="text-sm text-slate-500">정산예정액</p>
          <p className="text-2xl font-bold text-green-600">{totalSettlement.toLocaleString()}원</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <p className="text-sm text-slate-500">수수료</p>
          <p className="text-2xl font-bold text-orange-500">{totalFee.toLocaleString()}원</p>
        </div>
      </div>

      {/* 테이블 */}
      <div className="w-full bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <span className="text-sm text-slate-600">총 <strong className="text-slate-900">{revenues.length}</strong>건</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[750px]">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-3 sm:px-6 py-2 sm:py-4">주문번호</th>
                <th className="px-3 sm:px-6 py-2 sm:py-4 hidden md:table-cell">판매일</th>
                <th className="px-3 sm:px-6 py-2 sm:py-4 hidden md:table-cell">매출인식일</th>
                <th className="px-3 sm:px-6 py-2 sm:py-4 hidden lg:table-cell">정산예정일</th>
                <th className="px-3 sm:px-6 py-2 sm:py-4">상품</th>
                <th className="px-3 sm:px-6 py-2 sm:py-4 text-center">수량</th>
                <th className="px-3 sm:px-6 py-2 sm:py-4 text-right">판매가</th>
                <th className="px-3 sm:px-6 py-2 sm:py-4 text-right hidden sm:table-cell">수수료</th>
                <th className="px-3 sm:px-6 py-2 sm:py-4 text-right">정산금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {revenues.map((rev, revIdx) => (
                rev.items.map((item, itemIdx) => (
                  <tr key={`${rev.orderId}-${itemIdx}`} className="hover:bg-slate-50 transition-colors">
                    {itemIdx === 0 ? (
                      <>
                        <td className="px-3 sm:px-6 py-2 sm:py-4" rowSpan={rev.items.length}>
                          <div className="font-medium text-slate-900">{rev.orderId}</div>
                          <div className="text-xs text-slate-400 mt-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              rev.saleType === 'SALE' 
                                ? 'bg-blue-100 text-blue-700' 
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {rev.saleType === 'SALE' ? '판매' : rev.saleType}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-slate-600 whitespace-nowrap hidden md:table-cell" rowSpan={rev.items.length}>
                          {rev.saleDate}
                        </td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-slate-600 whitespace-nowrap hidden md:table-cell" rowSpan={rev.items.length}>
                          {rev.recognitionDate}
                        </td>
                        <td className="px-3 sm:px-6 py-2 sm:py-4 text-slate-600 whitespace-nowrap hidden lg:table-cell" rowSpan={rev.items.length}>
                          {rev.settlementDate}
                        </td>
                      </>
                    ) : null}
                    <td className="px-3 sm:px-6 py-2 sm:py-4">
                      <div className="font-medium text-slate-900 break-keep" title={item.productName}>
                        {item.productName}
                      </div>
                      {item.vendorItemName && (
                        <div className="text-xs text-slate-500 truncate max-w-xs" title={item.vendorItemName}>
                          {item.vendorItemName}
                        </div>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-4 text-center font-medium whitespace-nowrap">
                      {item.quantity}
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-4 text-right font-medium text-slate-900 whitespace-nowrap">
                      {(item.saleAmount || item.salePrice * item.quantity).toLocaleString()}원
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-4 text-right text-orange-500 whitespace-nowrap hidden sm:table-cell">
                      {(item.serviceFee + (item.serviceFeeVat || 0)).toLocaleString()}원
                    </td>
                    <td className="px-3 sm:px-6 py-2 sm:py-4 text-right font-medium text-green-600 whitespace-nowrap">
                      {item.settlementAmount.toLocaleString()}원
                    </td>
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
