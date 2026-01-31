import { Database } from '@/types/database';
import Link from 'next/link';

type Order = Database['public']['Tables']['orders']['Row'];
type OrderStatus = Database['public']['Enums']['order_status'];

interface OrderTableProps {
  orders: Order[];
  loading: boolean;
  onEdit?: (order: Order) => void;
  onDelete?: (order: Order) => void;
}

const statusMap: Record<OrderStatus, { label: string; className: string }> = {
  requested: { label: 'PRE INVOICE', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  pre_registered: { label: 'PRE INVOICE', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  shipping: { label: 'COMMERCIAL INVOICE', className: 'bg-green-100 text-green-800 border-green-200' },
  commercial_confirmed: { label: 'COMMERCIAL INVOICE', className: 'bg-green-100 text-green-800 border-green-200' },
  arrived: { label: '도착완료', className: 'bg-slate-100 text-slate-800 border-slate-200' },
};

const supplierMap: Record<string, string> = {
  YOUBEICHEN: 'YOUBEICHEN',
  QUYATIMEBABY: 'QUYATIMEBABY',
  OTHER: '기타',
};

export default function OrderTable({ orders, loading, onEdit, onDelete }: OrderTableProps) {
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

  if (orders.length === 0) {
    return (
      <div className="w-full bg-white rounded-lg border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-slate-500">
        <svg className="w-12 h-12 mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-lg font-medium">등록된 발주가 없습니다.</p>
        <p className="text-sm mt-1">새로운 발주를 등록해보세요.</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[700px]">
          <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
            <tr>
              <th className="px-3 sm:px-6 py-2 sm:py-4">발주번호</th>
              <th className="px-3 sm:px-6 py-2 sm:py-4">공장</th>
              <th className="px-3 sm:px-6 py-2 sm:py-4">상태</th>
              <th className="px-3 sm:px-6 py-2 sm:py-4 hidden md:table-cell">선박명</th>
              <th className="px-3 sm:px-6 py-2 sm:py-4 text-right">일정</th>
              <th className="px-3 sm:px-6 py-2 sm:py-4 text-right hidden sm:table-cell">총 CBM</th>
              <th className="px-3 sm:px-6 py-2 sm:py-4 text-right">총 금액</th>
              <th className="px-3 sm:px-6 py-2 sm:py-4 text-center">수정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {orders.map((order) => {
              // ETA 상태 계산
              const etaStatus = (() => {
                if (!order.eta || order.status === 'arrived') return 'normal';
                const etaDate = new Date(order.eta);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                etaDate.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil((etaDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) return 'overdue'; // ETA 지남 → 빨간색
                if (diffDays <= 3) return 'approaching'; // 3일 이내 → 노란색
                return 'normal';
              })();

              const rowClassName = {
                overdue: 'bg-red-100 hover:bg-red-200',
                approaching: 'bg-yellow-50 hover:bg-yellow-100',
                normal: 'hover:bg-slate-50',
              }[etaStatus];

              return (
              <tr 
                key={order.id} 
                className={`transition-colors group cursor-pointer ${rowClassName}`}
              >
                <td className="px-3 sm:px-6 py-2 sm:py-4 font-medium text-slate-900">
                  <Link href={`/logistics/orders/${order.id}`} className="block w-full h-full text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap">
                    {order.order_number}
                  </Link>
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-4 text-slate-600 whitespace-nowrap">
                  {supplierMap[order.supplier] || order.supplier}
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${statusMap[order.status]?.className || 'bg-slate-100 text-slate-800'}`}>
                    {statusMap[order.status]?.label || order.status}
                  </span>
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-4 text-slate-600 hidden md:table-cell">
                  {order.ship_name || '-'}
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-4 text-right text-slate-600 text-xs">
                  <div className="whitespace-nowrap"><span className="text-slate-400 mr-1">ETD</span>{order.etd || '-'}</div>
                  <div className="whitespace-nowrap"><span className="text-slate-400 mr-1">ETA</span>{order.eta || '-'}</div>
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-4 text-right text-slate-900 font-medium whitespace-nowrap hidden sm:table-cell">
                  {order.total_cbm ? `${order.total_cbm.toLocaleString()} CBM` : '-'}
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-4 text-right text-xs">
                  <div className="whitespace-nowrap font-medium text-slate-900">{order.total_amount_rmb ? `¥${order.total_amount_rmb.toLocaleString()}` : '-'}</div>
                  <div className="whitespace-nowrap text-slate-500">{order.total_amount_usd ? `$${order.total_amount_usd.toLocaleString()}` : '-'}</div>
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-4 text-center">
                  <div className="flex justify-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit?.(order);
                      }}
                      className="px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      수정
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete?.(order);
                      }}
                      className="px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 rounded transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
