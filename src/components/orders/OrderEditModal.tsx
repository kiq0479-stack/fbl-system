'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';

type Order = Database['public']['Tables']['orders']['Row'];
type Factory = Database['public']['Tables']['factories']['Row'];
type OrderStatus = Database['public']['Enums']['order_status'];

interface OrderEditModalProps {
  order: Order;
  onClose: () => void;
  onSuccess: () => void;
}

const STATUS_OPTIONS: { label: string; value: OrderStatus }[] = [
  { label: 'PRE INVOICE', value: 'pre_registered' },
  { label: 'COMMERCIAL INVOICE', value: 'commercial_confirmed' },
  { label: '도착완료', value: 'arrived' },
];

export default function OrderEditModal({ order, onClose, onSuccess }: OrderEditModalProps) {
  const [loading, setLoading] = useState(false);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryId, setFactoryId] = useState<string>(order.factory_id || '');
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [shipName, setShipName] = useState(order.ship_name || '');
  const [etd, setEtd] = useState(order.etd || '');
  const [eta, setEta] = useState(order.eta || '');
  const [totalCbm, setTotalCbm] = useState(order.total_cbm || 0);
  const [totalAmountUsd, setTotalAmountUsd] = useState(order.total_amount_usd || 0);

  const supabase = createClient();

  useEffect(() => {
    const fetchFactories = async () => {
      const { data } = await supabase
        .from('factories')
        .select('*')
        .eq('is_active', true)
        .order('name');
      setFactories(data || []);
    };
    fetchFactories();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Find selected factory name for supplier field (backward compat)
    const selectedFactory = factories.find(f => f.id === factoryId);
    const supplierName = selectedFactory?.name?.toUpperCase() || 'OTHER';

    try {
      const { error } = await (supabase
        .from('orders') as any)
        .update({
          factory_id: factoryId || null,
          supplier: supplierName,
          status,
          ship_name: shipName || null,
          etd: etd || null,
          eta: eta || null,
          total_cbm: totalCbm,
          total_amount_usd: totalAmountUsd,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      if (error) throw error;
      onSuccess();
    } catch (error) {
      console.error('Error updating order:', error);
      alert('발주 수정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-900">발주 수정</h2>
            <p className="text-sm text-slate-500">{order.order_number}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Status */}
          <div className="space-y-1">
            <label className="text-sm font-semibold text-slate-700">상태</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Factory (Supplier) */}
          <div className="space-y-1">
            <label className="text-sm font-semibold text-slate-700">공장 (Supplier)</label>
            <select
              value={factoryId}
              onChange={(e) => setFactoryId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
            >
              <option value="">선택하세요</option>
              {factories.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Ship Name */}
          <div className="space-y-1">
            <label className="text-sm font-semibold text-slate-700">선박명</label>
            <input
              type="text"
              value={shipName}
              onChange={(e) => setShipName(e.target.value)}
              placeholder="선박명 입력"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
            />
          </div>

          {/* ETD / ETA */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700">ETD (출발)</label>
              <input
                type="date"
                value={etd}
                onChange={(e) => setEtd(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700">ETA (도착)</label>
              <input
                type="date"
                value={eta}
                onChange={(e) => setEta(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
              />
            </div>
          </div>

          {/* Total CBM / Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700">총 CBM</label>
              <input
                type="number"
                step="0.01"
                value={totalCbm}
                onChange={(e) => setTotalCbm(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700">총 금액 (USD)</label>
              <input
                type="number"
                step="0.01"
                value={totalAmountUsd}
                onChange={(e) => setTotalAmountUsd(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
