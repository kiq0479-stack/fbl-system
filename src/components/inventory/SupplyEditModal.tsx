'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface SupplyEditModalProps {
  inventoryId: string;
  supplyName: string;
  currentQuantity: number;
  currentRackPosition: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SupplyEditModal({
  inventoryId,
  supplyName,
  currentQuantity,
  currentRackPosition,
  onClose,
  onSuccess,
}: SupplyEditModalProps) {
  const [quantity, setQuantity] = useState(currentQuantity);
  const [rackPosition, setRackPosition] = useState(currentRackPosition || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();

    try {
      const { error } = await (supabase
        .from('inventory') as any)
        .update({
          quantity,
          rack_position: rackPosition || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inventoryId);

      if (error) throw error;
      onSuccess();
    } catch (error) {
      console.error('Error updating supply inventory:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">부자재 재고 수정</h2>
          <p className="text-sm text-slate-500 mt-1">{supplyName}</p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">수량</label>
            <input
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">랙 위치</label>
            <input
              type="text"
              value={rackPosition}
              onChange={(e) => setRackPosition(e.target.value)}
              placeholder="예: A-1-3"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-blue-600">변경 내역</div>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">수량</span>
                <span className="font-medium">
                  {currentQuantity !== quantity ? (
                    <>{currentQuantity.toLocaleString()} → <span className="text-blue-700">{quantity.toLocaleString()}</span></>
                  ) : (
                    <span className="text-slate-400">변경 없음</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">랙 위치</span>
                <span className="font-medium">
                  {(currentRackPosition || '') !== rackPosition ? (
                    <>{currentRackPosition || '-'} → <span className="text-blue-700">{rackPosition || '-'}</span></>
                  ) : (
                    <span className="text-slate-400">변경 없음</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
