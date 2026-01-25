'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';

type Order = Database['public']['Tables']['orders']['Row'];
type SupplierType = Database['public']['Enums']['supplier_type'];
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
  const [supplier, setSupplier] = useState<SupplierType>(order.supplier);
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [shipName, setShipName] = useState(order.ship_name || '');
  const [etd, setEtd] = useState(order.etd || '');
  const [eta, setEta] = useState(order.eta || '');
  const [totalCbm, setTotalCbm] = useState(order.total_cbm || 0);
  const [totalAmountUsd, setTotalAmountUsd] = useState(order.total_amount_usd || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('orders')
        .update({
          supplier,
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

          {/* Supplier */}
          <div className="space-y-1">
            <label className="text-sm font-semibold text-slate-700">공장 (Supplier)</label>
            <select
              value={supplier}
              onChange={(e) => setSupplier(e.target.value as SupplierType)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
            >
              <option value="YOUBEICHEN">YOUBEICHEN</option>
              <option value="QUYATIMEBABY">QUYATIMEBABY</option>
              <option value="OTHER">기타</option>
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
