'use client';

import { useState, useEffect } from 'react';

interface NaverOrder {
  productOrderId: string;
  orderId: string;
  orderDate: string;
  paymentDate?: string;
  ordererName?: string;
  ordererTel?: string;
  paymentMeans?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPaymentAmount: number;
  productOrderStatus: string;
  placeOrderStatus?: string;
  shippingMemo?: string;
  expectedSettlementAmount?: number;
  shippingAddress?: {
    name?: string;
    tel1?: string;
    zipCode?: string;
    baseAddress?: string;
    detailedAddress?: string;
  };
  delivery?: {
    deliveryCompany?: string;
    trackingNumber?: string;
    deliveryStatus?: string;
  };
  _accountName: string;
  _storeName: string;
}

interface NaverOrderTableProps {
  from: string;
  to: string;
}

// 주문 상태 한글 변환
const statusLabels: Record<string, { label: string; color: string }> = {
  'PAYMENT_WAITING': { label: '결제대기', color: 'bg-yellow-100 text-yellow-800' },
  'PAYED': { label: '결제완료', color: 'bg-blue-100 text-blue-800' },
  'DELIVERING': { label: '배송중', color: 'bg-purple-100 text-purple-800' },
  'DELIVERED': { label: '배송완료', color: 'bg-green-100 text-green-800' },
  'PURCHASE_DECIDED': { label: '구매확정', color: 'bg-emerald-100 text-emerald-800' },
  'EXCHANGED': { label: '교환완료', color: 'bg-orange-100 text-orange-800' },
  'CANCELED': { label: '취소완료', color: 'bg-red-100 text-red-800' },
  'RETURNED': { label: '반품완료', color: 'bg-red-100 text-red-800' },
  'CANCELED_BY_NOPAYMENT': { label: '미결제취소', color: 'bg-gray-100 text-gray-800' },
};

export default function NaverOrderTable({ from, to }: NaverOrderTableProps) {
  const [orders, setOrders] = useState<NaverOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const [dateInfo, setDateInfo] = useState<{ from: string; to: string; days: number } | null>(null);

  useEffect(() => {
    fetchOrders();
  }, [from, to]);

  // 조회 기간 일수 계산
  const dayCount = Math.ceil(
    (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    setDateInfo(null);
    
    try {
      // YYYY-MM-DD 형식으로 전달 (API에서 처리)
      const res = await fetch(
        `/api/naver/orders?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&rangeType=ORDERED_DATETIME`
      );
      const data = await res.json();
      
      if (data.code === 'SUCCESS') {
        setOrders(data.data || []);
        setDateInfo(data.dateRange || null);
      } else {
        setError(data.error || '주문 조회 실패');
      }
    } catch (err) {
      setError('네트워크 오류');
    }
    
    setLoading(false);
  };

  // 요약 통계 계산
  const summary = {
    totalOrders: orders.length,
    totalQuantity: orders.reduce((sum, o) => sum + o.quantity, 0),
    totalAmount: orders.reduce((sum, o) => sum + o.totalPaymentAmount, 0),
    totalSettlement: orders.reduce((sum, o) => sum + (o.expectedSettlementAmount || 0), 0),
  };

  // 상품별 집계
  const productSummary = orders.reduce((acc, order) => {
    const name = order.productName;
    if (!acc[name]) {
      acc[name] = { count: 0, amount: 0 };
    }
    acc[name].count += order.quantity;
    acc[name].amount += order.totalPaymentAmount;
    return acc;
  }, {} as Record<string, { count: number; amount: number }>);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8">
        <div className="flex flex-col items-center justify-center gap-3">
          <svg className="animate-spin h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-slate-600">네이버 주문 조회 중...</span>
          {dayCount > 1 && (
            <span className="text-sm text-slate-400">
              {dayCount}일 기간 조회 중 (약 {Math.ceil(dayCount / 5)}초 소요 예상)
            </span>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-8">
        <div className="flex items-center justify-center text-red-600">
          <svg className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm text-slate-500">총 주문</div>
          <div className="text-2xl font-bold text-slate-900">{summary.totalOrders}건</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm text-slate-500">총 수량</div>
          <div className="text-2xl font-bold text-slate-900">{summary.totalQuantity}개</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm text-slate-500">총 결제금액</div>
          <div className="text-2xl font-bold text-green-600">{summary.totalAmount.toLocaleString()}원</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-sm text-slate-500">예상 정산금액</div>
          <div className="text-2xl font-bold text-blue-600">{summary.totalSettlement.toLocaleString()}원</div>
        </div>
      </div>

      {/* 상품별 요약 */}
      {Object.keys(productSummary).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">상품별 요약</h3>
          <div className="space-y-2">
            {Object.entries(productSummary).map(([name, info]) => (
              <div key={name} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                <span className="text-sm text-slate-700 truncate flex-1 mr-4">{name}</span>
                <span className="text-sm font-medium text-slate-900 whitespace-nowrap">
                  {info.count}개 / {info.amount.toLocaleString()}원
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 주문 테이블 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">주문번호</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">주문일시</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">상품명</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">수량</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">결제금액</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">상태</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">주문자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    조회된 주문이 없습니다.
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const status = statusLabels[order.productOrderStatus] || { 
                    label: order.productOrderStatus, 
                    color: 'bg-gray-100 text-gray-800' 
                  };
                  const isExpanded = expandedRow === order.productOrderId;
                  
                  return (
                    <>
                      <tr 
                        key={order.productOrderId}
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => setExpandedRow(isExpanded ? null : order.productOrderId)}
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-mono text-slate-900">{order.productOrderId}</div>
                          <div className="text-xs text-slate-400">{order.orderId}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-900">
                            {new Date(order.orderDate).toLocaleDateString('ko-KR')}
                          </div>
                          <div className="text-xs text-slate-400">
                            {new Date(order.orderDate).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-900 max-w-xs truncate" title={order.productName}>
                            {order.productName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-medium text-slate-900">{order.quantity}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-sm font-medium text-slate-900">
                            {order.totalPaymentAmount.toLocaleString()}원
                          </div>
                          {order.expectedSettlementAmount && (
                            <div className="text-xs text-slate-400">
                              정산: {order.expectedSettlementAmount.toLocaleString()}원
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-900">{order.ordererName}</div>
                          <div className="text-xs text-slate-400">{order.paymentMeans}</div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <h4 className="font-semibold text-slate-700 mb-2">배송 정보</h4>
                                <div className="space-y-1 text-slate-600">
                                  <p><span className="text-slate-400">수령인:</span> {order.shippingAddress?.name}</p>
                                  <p><span className="text-slate-400">연락처:</span> {order.shippingAddress?.tel1}</p>
                                  <p><span className="text-slate-400">주소:</span> {order.shippingAddress?.baseAddress} {order.shippingAddress?.detailedAddress}</p>
                                  {order.shippingMemo && (
                                    <p><span className="text-slate-400">배송메모:</span> {order.shippingMemo}</p>
                                  )}
                                </div>
                              </div>
                              {order.delivery && (
                                <div>
                                  <h4 className="font-semibold text-slate-700 mb-2">배송 현황</h4>
                                  <div className="space-y-1 text-slate-600">
                                    <p><span className="text-slate-400">택배사:</span> {order.delivery.deliveryCompany}</p>
                                    <p><span className="text-slate-400">송장번호:</span> {order.delivery.trackingNumber}</p>
                                    <p><span className="text-slate-400">배송상태:</span> {order.delivery.deliveryStatus}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
