'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface WarehouseEditModalProps {
  inventoryId: string;
  productId: string;
  productName: string;
  currentQuantity: number;
  currentPalletCount: number | null;
  currentExtraBoxes: number | null;
  palletQty: number | null;  // 파렛트당 박스 수량 (상품 테이블에서)
  onClose: () => void;
  onSuccess: () => void;
}

export default function WarehouseEditModal({
  inventoryId,
  productId,
  productName,
  currentQuantity,
  currentPalletCount,
  currentExtraBoxes,
  palletQty,
  onClose,
  onSuccess,
}: WarehouseEditModalProps) {
  const [palletCount, setPalletCount] = useState(currentPalletCount || 0);
  const [extraBoxes, setExtraBoxes] = useState(currentExtraBoxes || 0);
  const [saving, setSaving] = useState(false);

  // 계산된 총 수량
  const calculatedQty = palletQty ? (palletCount * palletQty) + extraBoxes : currentQuantity;

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();

    try {
      const { error } = await (supabase
        .from('inventory') as any)
        .update({
          pallet_count: palletCount,
          extra_boxes: extraBoxes,
          quantity: calculatedQty,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inventoryId);

      if (error) throw error;

      onSuccess();
    } catch (error) {
      console.error('Error updating inventory:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">창고 재고 수정</h2>
          <p className="text-sm text-slate-500 mt-1">{productName}</p>
        </div>

        <div className="p-6 space-y-4">
          {/* 파렛트당 박스 수량 (참고용) */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="text-sm text-slate-500">파렛트당 박스 수량</div>
            <div className="text-xl font-bold text-slate-900">
              {palletQty ? `${palletQty}개` : '미설정'}
            </div>
          </div>

          {/* 파렛트 수 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              파렛트 수
            </label>
            <input
              type="number"
              min="0"
              value={palletCount}
              onChange={(e) => setPalletCount(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 남은 박스 수 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              남은 박스 수
            </label>
            <input
              type="number"
              min="0"
              value={extraBoxes}
              onChange={(e) => setExtraBoxes(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 계산된 총 수량 */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-blue-600">계산된 총 수량</div>
            <div className="text-2xl font-bold text-blue-700">
              {calculatedQty.toLocaleString()}개
            </div>
            {palletQty && (
              <div className="text-xs text-blue-500 mt-1">
                ({palletCount} × {palletQty}) + {extraBoxes} = {calculatedQty}
              </div>
            )}
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
