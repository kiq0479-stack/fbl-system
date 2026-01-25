'use client';

import { useState, useEffect } from 'react';

interface CoupangOrderItem {
  vendorItemId: number;
  vendorItemName: string;
  shippingCount: number;
  salesPrice: number;
  orderPrice: number;
  sellerProductName: string;
  sellerProductItemName: string;
  externalVendorSkuCode?: string;
}

interface CoupangOrder {
  shipmentBoxId: number;
  orderId: number;
  orderedAt: string;
  ordererName: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddr1: string;
  receiverAddr2: string;
  receiverZipCode: string;
  status: string;
  orderItems: CoupangOrderItem[];
}

interface CoupangOrderTableProps {
  status: string;
  from: string;
  to: string;
}

export default function CoupangOrderTable({ status, from, to }: CoupangOrderTableProps) {
  const [orders, setOrders] = useState<CoupangOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch(`/api/coupang/orders?status=${status}&from=${from}&to=${to}`);
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
  }, [status, from, to]);

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
        <svg className="w-12 h-12 mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p className="text-lg font-medium">주문이 없습니다.</p>
        <p className="text-sm mt-1">해당 기간에 {status} 상태의 주문이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
        <span className="text-sm text-slate-600">총 <strong className="text-slate-900">{orders.length}</strong>건</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">주문번호</th>
              <th className="px-6 py-4">주문일시</th>
              <th className="px-6 py-4">상품</th>
              <th className="px-6 py-4 text-center">수량</th>
              <th className="px-6 py-4">수령인</th>
              <th className="px-6 py-4">배송지</th>
              <th className="px-6 py-4 text-right">금액</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {orders.map((order) => (
              <tr key={order.shipmentBoxId} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-900">{order.orderId}</div>
                  <div className="text-xs text-slate-400">Box: {order.shipmentBoxId}</div>
                </td>
                <td className="px-6 py-4 text-slate-600">
                  {new Date(order.orderedAt).toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="px-6 py-4">
                  {order.orderItems.map((item, idx) => (
                    <div key={idx} className="mb-1 last:mb-0">
                      <div className="font-medium text-slate-900 truncate max-w-xs" title={item.sellerProductName}>
                        {item.sellerProductName}
                      </div>
                      {item.sellerProductItemName && (
                        <div className="text-xs text-slate-500">{item.sellerProductItemName}</div>
                      )}
                    </div>
                  ))}
                </td>
                <td className="px-6 py-4 text-center">
                  {order.orderItems.map((item, idx) => (
                    <div key={idx} className="mb-1 last:mb-0 font-medium">
                      {item.shippingCount}
                    </div>
                  ))}
                </td>
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-900">{order.receiverName}</div>
                  <div className="text-xs text-slate-500">{order.receiverPhone}</div>
                </td>
                <td className="px-6 py-4 text-slate-600">
                  <div className="max-w-xs truncate" title={`${order.receiverAddr1} ${order.receiverAddr2}`}>
                    {order.receiverAddr1}
                  </div>
                  <div className="text-xs text-slate-400">{order.receiverZipCode}</div>
                </td>
                <td className="px-6 py-4 text-right">
                  {order.orderItems.map((item, idx) => (
                    <div key={idx} className="mb-1 last:mb-0 font-medium text-slate-900">
                      {item.orderPrice.toLocaleString()}원
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
