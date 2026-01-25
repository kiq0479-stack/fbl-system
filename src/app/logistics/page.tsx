'use client';

import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type OrderAlert = {
  id: string;
  order_number: string;
  eta: string;
  status: 'approaching' | 'overdue';
};

type InboundAlert = {
  id: string;
  request_number: string;
  expected_date: string;
  warehouse_name: string;
  total_pallets: number;
};

type RecentActivity = {
  id: string;
  type: 'order' | 'inbound';
  title: string;
  description: string;
  date: string;
};

type InventorySummary = {
  warehouse: number;
  coupang: number;
  naver: number;
  inTransit: number;
  total: number;
};

export default function LogisticsDashboard() {
  const [counts, setCounts] = useState({ products: 0, supplies: 0 });
  const [orderStats, setOrderStats] = useState({ inProgress: 0, alerts: [] as OrderAlert[] });
  const [inboundStats, setInboundStats] = useState({ pending: 0, alerts: [] as InboundAlert[] });
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [inventory, setInventory] = useState<InventorySummary>({ warehouse: 0, coupang: 0, naver: 0, inTransit: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      await Promise.all([
        fetchCounts(),
        fetchOrderStats(),
        fetchInboundStats(),
        fetchRecentActivities(),
        fetchInventorySummary(),
      ]);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const fetchCounts = async () => {
    const { count: productCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
    const { count: supplyCount } = await supabase.from('supplies').select('*', { count: 'exact', head: true });
    setCounts({
      products: productCount || 0,
      supplies: supplyCount || 0
    });
  };

  const fetchOrderStats = async () => {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, eta, status')
      .in('status', ['requested', 'pre_registered', 'shipping', 'commercial_confirmed']);

    if (!orders) {
      setOrderStats({ inProgress: 0, alerts: [] });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const alerts: OrderAlert[] = [];
    (orders as { id: string; order_number: string; eta: string | null; status: string }[]).forEach(order => {
      if (!order.eta) return;
      const etaDate = new Date(order.eta);
      etaDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((etaDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) {
        alerts.push({ id: order.id, order_number: order.order_number, eta: order.eta, status: 'overdue' });
      } else if (diffDays <= 3) {
        alerts.push({ id: order.id, order_number: order.order_number, eta: order.eta, status: 'approaching' });
      }
    });

    alerts.sort((a, b) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1;
      if (a.status !== 'overdue' && b.status === 'overdue') return 1;
      return new Date(a.eta).getTime() - new Date(b.eta).getTime();
    });

    setOrderStats({ inProgress: orders.length, alerts });
  };

  const fetchInboundStats = async () => {
    const { data: inbounds } = await supabase
      .from('inbound_requests')
      .select('id, request_number, expected_date, warehouse_name, total_pallets, status')
      .in('status', ['pending', 'in_transit']);

    if (!inbounds) {
      setInboundStats({ pending: 0, alerts: [] });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    type InboundRow = { id: string; request_number: string; expected_date: string; warehouse_name: string; total_pallets: number; status: string };
    const alerts: InboundAlert[] = (inbounds as InboundRow[])
      .filter(inbound => {
        const expectedDate = new Date(inbound.expected_date);
        expectedDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((expectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 1;
      })
      .map(inbound => ({
        id: inbound.id,
        request_number: inbound.request_number,
        expected_date: inbound.expected_date,
        warehouse_name: inbound.warehouse_name,
        total_pallets: inbound.total_pallets,
      }));

    const totalPallets = (inbounds as InboundRow[]).reduce((sum, i) => sum + (i.total_pallets || 0), 0);
    setInboundStats({ pending: totalPallets, alerts });
  };

  const fetchRecentActivities = async () => {
    const activities: RecentActivity[] = [];

    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(5);

    const statusLabels: Record<string, string> = {
      requested: '요청됨',
      pre_registered: 'PRE 등록',
      shipping: '선적중',
      commercial_confirmed: 'COMMERCIAL 확정',
      arrived: '도착완료',
    };

    (orders as { id: string; order_number: string; status: string; updated_at: string }[] | null)?.forEach(order => {
      activities.push({
        id: `order-${order.id}`,
        type: 'order',
        title: order.order_number,
        description: statusLabels[order.status] || order.status,
        date: order.updated_at,
      });
    });

    const { data: inbounds } = await supabase
      .from('inbound_requests')
      .select('id, request_number, status, warehouse_name, updated_at')
      .order('updated_at', { ascending: false })
      .limit(5);

    const inboundStatusLabels: Record<string, string> = {
      pending: '대기중',
      in_transit: '입고중',
      completed: '입고완료',
      cancelled: '취소됨',
    };

    (inbounds as { id: string; request_number: string; status: string; warehouse_name: string; updated_at: string }[] | null)?.forEach(inbound => {
      activities.push({
        id: `inbound-${inbound.id}`,
        type: 'inbound',
        title: inbound.request_number,
        description: `${inbound.warehouse_name} - ${inboundStatusLabels[inbound.status] || inbound.status}`,
        date: inbound.updated_at,
      });
    });

    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setRecentActivities(activities.slice(0, 10));
  };

  const fetchInventorySummary = async () => {
    const { data: inventoryData } = await supabase
      .from('inventory')
      .select('location, quantity')
      .not('product_id', 'is', null);

    const { data: inTransitData } = await supabase
      .from('order_items')
      .select('pre_qty, commercial_qty, order:orders!inner(status)')
      .in('order.status', ['shipping', 'commercial_confirmed']);

    const summary: InventorySummary = { warehouse: 0, coupang: 0, naver: 0, inTransit: 0, total: 0 };

    inventoryData?.forEach((item: any) => {
      const qty = item.quantity || 0;
      switch (item.location) {
        case 'warehouse': summary.warehouse += qty; break;
        case 'coupang': summary.coupang += qty; break;
        case 'naver': summary.naver += qty; break;
      }
    });

    inTransitData?.forEach((item: any) => {
      summary.inTransit += item.commercial_qty ?? item.pre_qty ?? 0;
    });

    summary.total = summary.warehouse + summary.coupang + summary.naver + summary.inTransit;
    setInventory(summary);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    return date.toLocaleDateString('ko-KR');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
      
      {/* 알림 배너 */}
      {(orderStats.alerts.filter(a => a.status === 'overdue').length > 0 || inboundStats.alerts.length > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-800 font-medium mb-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            확인이 필요한 항목
          </div>
          <div className="space-y-1 text-sm text-red-700">
            {orderStats.alerts.filter(a => a.status === 'overdue').map(alert => (
              <div key={alert.id}>
                • 발주 <Link href={`/logistics/orders/${alert.id}`} className="font-medium underline">{alert.order_number}</Link> ETA 경과 ({alert.eta})
              </div>
            ))}
            {inboundStats.alerts.map(alert => (
              <div key={alert.id}>
                • 입고 <Link href="/logistics/inbound" className="font-medium underline">{alert.request_number}</Link> 도착예정 ({alert.expected_date}, {alert.warehouse_name})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 상단 카드 4개 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link href="/logistics/products" className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col hover:shadow-md transition-shadow">
          <span className="text-sm font-medium text-slate-500 mb-1">총 상품 수</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">{loading ? '-' : counts.products}</span>
            <span className="text-sm text-slate-400">items</span>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center text-sm text-blue-600 font-medium">
            상품 관리 바로가기 →
          </div>
        </Link>

        <Link href="/logistics/supplies" className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col hover:shadow-md transition-shadow">
          <span className="text-sm font-medium text-slate-500 mb-1">총 부자재 수</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">{loading ? '-' : counts.supplies}</span>
            <span className="text-sm text-slate-400">items</span>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center text-sm text-blue-600 font-medium">
            부자재 관리 바로가기 →
          </div>
        </Link>
        
        <Link href="/logistics/orders" className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col hover:shadow-md transition-shadow">
          <span className="text-sm font-medium text-slate-500 mb-1">진행중인 발주</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">{loading ? '-' : orderStats.inProgress}</span>
            <span className="text-sm text-slate-400">orders</span>
          </div>
          {orderStats.alerts.length > 0 && (
            <div className="mt-2 flex gap-1">
              {orderStats.alerts.filter(a => a.status === 'overdue').length > 0 && (
                <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                  {orderStats.alerts.filter(a => a.status === 'overdue').length}건 경과
                </span>
              )}
              {orderStats.alerts.filter(a => a.status === 'approaching').length > 0 && (
                <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                  {orderStats.alerts.filter(a => a.status === 'approaching').length}건 임박
                </span>
              )}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center text-sm text-blue-600 font-medium">
            발주 관리 바로가기 →
          </div>
        </Link>

        <Link href="/logistics/inbound" className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col hover:shadow-md transition-shadow">
          <span className="text-sm font-medium text-slate-500 mb-1">입고 대기</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">{loading ? '-' : inboundStats.pending}</span>
            <span className="text-sm text-slate-400">pallets</span>
          </div>
          {inboundStats.alerts.length > 0 && (
            <div className="mt-2">
              <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                {inboundStats.alerts.length}건 도착예정
              </span>
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center text-sm text-blue-600 font-medium">
            입고 관리 바로가기 →
          </div>
        </Link>
      </div>

      {/* 하단 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 최근 활동 내역 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">최근 활동 내역</h2>
          {loading ? (
            <div className="text-center text-slate-400 py-8">로딩중...</div>
          ) : recentActivities.length === 0 ? (
            <div className="text-center text-slate-400 py-8">활동 내역이 없습니다</div>
          ) : (
            <div className="space-y-3">
              {recentActivities.map(activity => (
                <div key={activity.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    activity.type === 'order' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'
                  }`}>
                    {activity.type === 'order' ? '발' : '입'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">{activity.title}</div>
                    <div className="text-sm text-slate-500 truncate">{activity.description}</div>
                  </div>
                  <div className="text-xs text-slate-400 whitespace-nowrap">{formatDate(activity.date)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 재고 현황 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">재고 현황</h2>
          {loading ? (
            <div className="text-center text-slate-400 py-8">로딩중...</div>
          ) : (
            <div className="space-y-4">
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="text-sm text-slate-500">총 재고</div>
                <div className="text-3xl font-bold text-slate-900">{inventory.total.toLocaleString()}</div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-16 text-sm text-slate-600">창고</span>
                  <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: inventory.total > 0 ? `${(inventory.warehouse / inventory.total) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="w-20 text-right text-sm font-medium">{inventory.warehouse.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-16 text-sm text-slate-600">쿠팡</span>
                  <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-orange-500 rounded-full transition-all"
                      style={{ width: inventory.total > 0 ? `${(inventory.coupang / inventory.total) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="w-20 text-right text-sm font-medium">{inventory.coupang.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-16 text-sm text-slate-600">선적중</span>
                  <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500 rounded-full transition-all"
                      style={{ width: inventory.total > 0 ? `${(inventory.inTransit / inventory.total) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="w-20 text-right text-sm font-medium">{inventory.inTransit.toLocaleString()}</span>
                </div>
              </div>

              <Link href="/logistics/inventory" className="block text-center text-sm text-blue-600 font-medium hover:underline pt-2">
                재고 관리 바로가기 →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
