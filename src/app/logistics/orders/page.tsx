'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';
import OrderTable from '@/components/orders/OrderTable';
import OrderForm from '@/components/orders/OrderForm';
import OrderEditModal from '@/components/orders/OrderEditModal';

type Order = Database['public']['Tables']['orders']['Row'];
type OrderStatus = Database['public']['Enums']['order_status'];

const STATUS_FILTERS: { label: string; value: OrderStatus | 'all' }[] = [
  { label: '전체', value: 'all' },
  { label: 'PRE INVOICE', value: 'pre_registered' },
  { label: 'COMMERCIAL INVOICE', value: 'commercial_confirmed' },
  { label: '도착완료', value: 'arrived' },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<OrderStatus | 'all'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const supabase = createClient();

  const handleDeleteOrder = async (order: Order) => {
    if (!confirm(`발주 "${order.order_number}"을(를) 삭제하시겠습니까?\n관련 품목도 함께 삭제됩니다.`)) {
      return;
    }

    try {
      // 먼저 order_items 삭제
      await supabase.from('order_items').delete().eq('order_id', order.id);
      // order 삭제
      const { error } = await supabase.from('orders').delete().eq('id', order.id);
      
      if (error) throw error;
      fetchOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase.from('orders').select('*, factories(name)').order('created_at', { ascending: false });

    if (activeFilter !== 'all') {
      query = query.eq('status', activeFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching orders:', error);
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, [activeFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">발주 관리</h1>
          <p className="text-sm text-slate-500 mt-1">발주 현황을 조회하고 새로운 발주를 등록합니다.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          발주 등록
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setActiveFilter(filter.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
              activeFilter === filter.value
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <OrderTable 
        orders={orders} 
        loading={loading} 
        onEdit={(order) => setEditingOrder(order)} 
        onDelete={handleDeleteOrder}
      />

      {isModalOpen && (
        <OrderForm
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            fetchOrders();
          }}
        />
      )}

      {editingOrder && (
        <OrderEditModal
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSuccess={() => {
            setEditingOrder(null);
            fetchOrders();
          }}
        />
      )}
    </div>
  );
}
