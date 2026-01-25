'use client';

import { useState, useEffect, useMemo } from 'react';

interface SellerOrderItem {
  vendorItemId: number;
  vendorItemName: string;
  shippingCount: number;
  salesPrice: number;
  orderPrice: number;
  sellerProductName: string;
  sellerProductItemName: string;
}

interface SellerOrder {
  shipmentBoxId: number;
  orderId: number;
  orderedAt: string;
  status: string;
  orderItems: SellerOrderItem[];
}

interface SellerDeliveryTableProps {
  from: string;
  to: string;
}

type SortField = 'orderedAt' | 'productName' | 'shippingCount' | 'orderPrice';
type SortOrder = 'asc' | 'desc';

const STATUS_LABELS: Record<string, string> = {
  ACCEPT: '결제완료',
  INSTRUCT: '상품준비중',
  DEPARTURE: '배송지시',
  DELIVERING: '배송중',
  FINAL_DELIVERY: '배송완료',
};

const STATUS_COLORS: Record<string, string> = {
  ACCEPT: 'bg-yellow-100 text-yellow-800',
  INSTRUCT: 'bg-blue-100 text-blue-800',
  DEPARTURE: 'bg-purple-100 text-purple-800',
  DELIVERING: 'bg-indigo-100 text-indigo-800',
  FINAL_DELIVERY: 'bg-green-100 text-green-800',
};

export default function SellerDeliveryTable({ from, to }: SellerDeliveryTableProps) {
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('orderedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch(`/api/coupang/seller/orders?from=${from}&to=${to}`);
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
        case 'orderedAt':
          aVal = new Date(a.orderedAt).getTime();
          bVal = new Date(b.orderedAt).getTime();
          break;
        case 'productName':
          aVal = a.orderItems[0]?.sellerProductName || '';
          bVal = b.orderItems[0]?.sellerProductName || '';
          break;
        case 'shippingCount':
          aVal = a.orderItems.reduce((sum, item) => sum + item.shippingCount, 0);
          bVal = b.orderItems.reduce((sum, item) => sum + item.shippingCount, 0);
          break;
        case 'orderPrice':
          aVal = a.orderItems.reduce((sum, item) => sum + item.orderPrice, 0);
          bVal = b.orderItems.reduce((sum, item) => sum + item.orderPrice, 0);
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
      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // 통계 계산
  const totalOrders = orders.length;
  const totalQuantity = orders.reduce((sum, order) => 
    sum + order.orderItems.reduce((itemSum, item) => itemSum + item.shippingCount, 0), 0);
  const totalSales = orders.reduce((sum, order) => 
    sum + order.orderItems.reduce((itemSum, item) => itemSum + item.orderPrice, 0), 0);

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
        <svg className="w-12 h-12 mb-4 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
        <p className="text-lg font-medium">판매자배송 주문이 없습니다.</p>
        <p className="text-sm mt-1">해당 기간에 판매자배송 주문이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <p className="text-sm text-slate-500">총 주문</p>
          <p className="text-2xl font-bold text-slate-900">{totalOrders.toLocaleString()}건</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <p className="text-sm text-slate-500">총 판매량</p>
          <p className="text-2xl font-bold text-blue-600">{totalQuantity.toLocaleString()}개</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <p className="text-sm text-slate-500">총 매출</p>
          <p className="text-2xl font-bold text-green-600">{Math.round(totalSales).toLocaleString()}원</p>
        </div>
      </div>

      {/* 테이블 */}
      <div className="w-full bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-white">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <span className="text-sm text-slate-600">판매자배송 총 <strong className="text-slate-900">{totalOrders}</strong>건</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">주문번호</th>
                <th 
                  className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  onClick={() => handleSort('orderedAt')}
                >
                  <div className="flex items-center gap-1">
                    주문일시
                    <SortIcon field="orderedAt" />
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
                  onClick={() => handleSort('shippingCount')}
                >
                  <div className="flex items-center justify-center gap-1">
                    수량
                    <SortIcon field="shippingCount" />
                  </div>
                </th>
                <th className="px-6 py-4 text-center">상태</th>
                <th 
                  className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  onClick={() => handleSort('orderPrice')}
                >
                  <div className="flex items-center justify-end gap-1">
                    금액
                    <SortIcon field="orderPrice" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedOrders.map((order) => (
                order.orderItems.map((item, itemIdx) => (
                  <tr key={`${order.shipmentBoxId}-${itemIdx}`} className="hover:bg-slate-50 transition-colors">
                    {itemIdx === 0 ? (
                      <>
                        <td className="px-6 py-4" rowSpan={order.orderItems.length}>
                          <div className="font-medium text-slate-900">{order.orderId}</div>
                          <div className="text-xs text-slate-400">Box: {order.shipmentBoxId}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-600" rowSpan={order.orderItems.length}>
                          {new Date(order.orderedAt).toLocaleString('ko-KR', {
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
                      <div className="font-medium text-slate-900 truncate max-w-xs" title={item.sellerProductName}>
                        {item.sellerProductName}
                      </div>
                      {item.sellerProductItemName && (
                        <div className="text-xs text-slate-400">{item.sellerProductItemName}</div>
                      )}
                      <div className="text-xs text-slate-400">옵션ID: {item.vendorItemId}</div>
                    </td>
                    <td className="px-6 py-4 text-center font-medium">
                      {item.shippingCount}
                    </td>
                    {itemIdx === 0 ? (
                      <td className="px-6 py-4 text-center" rowSpan={order.orderItems.length}>
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-800'}`}>
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                      </td>
                    ) : null}
                    <td className="px-6 py-4 text-right font-medium text-green-600">
                      {item.orderPrice.toLocaleString()}원
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
