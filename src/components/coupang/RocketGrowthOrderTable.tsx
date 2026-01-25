'use client';

import { useState, useEffect, useMemo } from 'react';

interface RocketGrowthOrderItem {
  vendorItemId: number;
  productName: string;
  salesQuantity: number;
  unitSalesPrice: string;
  currency: string;
}

interface RocketGrowthOrder {
  orderId: number;
  vendorId: string;
  paidAt: number; // timestamp
  orderItems: RocketGrowthOrderItem[];
}

interface RocketGrowthOrderTableProps {
  from: string;
  to: string;
}

type SortField = 'paidAt' | 'productName' | 'salesQuantity' | 'unitSalesPrice';
type SortOrder = 'asc' | 'desc';

export default function RocketGrowthOrderTable({ from, to }: RocketGrowthOrderTableProps) {
  const [orders, setOrders] = useState<RocketGrowthOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('paidAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch(`/api/coupang/rocket/orders?from=${from}&to=${to}`);
        const data = await res.json();
        
        if (data.error) {
          setError(data.error);
          setOrders([]);
        } else {
          setOrders(data.data || []);
        }
      } catch (err) {
        setError('주문을 불러오는데 실패했습니다.');
        setOrders([]);
      }
      
      setLoading(false);
    };

    fetchOrders();
  }, [from, to]);

  // 정렬된 주문 목록
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortField) {
        case 'paidAt':
          aVal = a.paidAt;
          bVal = b.paidAt;
          break;
        case 'productName':
          aVal = a.orderItems[0]?.productName || '';
          bVal = b.orderItems[0]?.productName || '';
          break;
        case 'salesQuantity':
          aVal = a.orderItems.reduce((sum, item) => sum + item.salesQuantity, 0);
          bVal = b.orderItems.reduce((sum, item) => sum + item.salesQuantity, 0);
          break;
        case 'unitSalesPrice':
          aVal = a.orderItems.reduce((sum, item) => sum + parseFloat(item.unitSalesPrice) * item.salesQuantity, 0);
          bVal = b.orderItems.reduce((sum, item) => sum + parseFloat(item.unitSalesPrice) * item.salesQuantity, 0);
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal, 'ko') : bVal.localeCompare(aVal, 'ko');
      }
      
      return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [orders, sortField, sortOrder]);

  // 정렬 토글 핸들러
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // 정렬 아이콘 컴포넌트
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortOrder === 'asc' ? (
      <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // 통계 계산
  const totalOrders = orders.length;
  const totalQuantity = orders.reduce((sum, order) => 
    sum + order.orderItems.reduce((itemSum, item) => itemSum + item.salesQuantity, 0), 0);
  const totalSales = orders.reduce((sum, order) => 
    sum + order.orderItems.reduce((itemSum, item) => 
      itemSum + (parseFloat(item.unitSalesPrice) * item.salesQuantity), 0), 0);

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

  if (orders.length === 0) {
    return (
      <div className="w-full bg-white rounded-lg border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-slate-500">
        <svg className="w-12 h-12 mb-4 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <p className="text-lg font-medium">로켓그로스 주문이 없습니다.</p>
        <p className="text-sm mt-1">해당 기간에 로켓그로스 주문이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 안내 배너 */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-amber-800">실시간 주문 현황 (취소 건 포함)</p>
          <p className="text-sm text-amber-700 mt-1">
            결제된 주문을 빠르게 확인하는 용도입니다. 취소 건이 포함되어 있어 Wing과 수치가 다를 수 있습니다.
            정확한 순매출은 <strong className="text-amber-900">매출내역</strong> 탭에서 확인하세요.
          </p>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <p className="text-sm text-slate-500">총 주문</p>
          <p className="text-2xl font-bold text-slate-900">{totalOrders.toLocaleString()}건</p>
          <p className="text-xs text-slate-400 mt-1">취소 건 포함</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <p className="text-sm text-slate-500">총 판매량</p>
          <p className="text-2xl font-bold text-purple-600">{totalQuantity.toLocaleString()}개</p>
          <p className="text-xs text-slate-400 mt-1">취소 건 포함</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <p className="text-sm text-slate-500">총 매출</p>
          <p className="text-2xl font-bold text-green-600">{Math.round(totalSales).toLocaleString()}원</p>
          <p className="text-xs text-slate-400 mt-1">취소 건 포함 (참고용)</p>
        </div>
      </div>

      {/* 테이블 */}
      <div className="w-full bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-white">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-sm text-slate-600">로켓그로스 총 <strong className="text-slate-900">{totalOrders}</strong>건</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">주문번호</th>
                <th 
                  className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  onClick={() => handleSort('paidAt')}
                >
                  <div className="flex items-center gap-1">
                    결제일시
                    <SortIcon field="paidAt" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  onClick={() => handleSort('productName')}
                >
                  <div className="flex items-center gap-1">
                    상품명
                    <SortIcon field="productName" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  onClick={() => handleSort('salesQuantity')}
                >
                  <div className="flex items-center justify-center gap-1">
                    수량
                    <SortIcon field="salesQuantity" />
                  </div>
                </th>
                <th className="px-6 py-4 text-right">단가</th>
                <th 
                  className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  onClick={() => handleSort('unitSalesPrice')}
                >
                  <div className="flex items-center justify-end gap-1">
                    합계
                    <SortIcon field="unitSalesPrice" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedOrders.map((order) => (
                order.orderItems.map((item, itemIdx) => (
                  <tr key={`${order.orderId}-${itemIdx}`} className="hover:bg-slate-50 transition-colors">
                    {itemIdx === 0 ? (
                      <>
                        <td className="px-6 py-4" rowSpan={order.orderItems.length}>
                          <div className="font-medium text-slate-900">{order.orderId}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-600" rowSpan={order.orderItems.length}>
                          {new Date(order.paidAt).toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </>
                    ) : null}
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 truncate max-w-xs" title={item.productName}>
                        {item.productName}
                      </div>
                      <div className="text-xs text-slate-400">옵션ID: {item.vendorItemId}</div>
                    </td>
                    <td className="px-6 py-4 text-center font-medium">
                      {item.salesQuantity}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600">
                      {parseFloat(item.unitSalesPrice).toLocaleString()}원
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-green-600">
                      {(parseFloat(item.unitSalesPrice) * item.salesQuantity).toLocaleString()}원
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
