'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { InventoryLocation, InventoryChangeType } from '@/types/database';

// 타입 추론 이슈로 untyped client 사용
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ModalType = 'in' | 'out' | 'transfer';

type Product = { id: string; name: string; sku: string };
type Supply = { id: string; name: string; sku: string };

interface InventoryModalProps {
  type: ModalType;
  itemType: 'product' | 'supply';
  onClose: () => void;
  onSuccess: () => void;
}

const locationLabels: Record<InventoryLocation, string> = {
  warehouse: '창고',
  coupang: '쿠팡',
  naver: '네이버',
  in_transit: '선적중',
};

const modalTitles: Record<ModalType, string> = {
  in: '입고 등록',
  out: '출고 등록',
  transfer: '재고 이동',
};

export default function InventoryModal({ type, itemType, onClose, onSuccess }: InventoryModalProps) {
  const [items, setItems] = useState<(Product | Supply)[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [location, setLocation] = useState<InventoryLocation>('warehouse');
  const [toLocation, setToLocation] = useState<InventoryLocation>('coupang');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchItems();
  }, [itemType]);

  const fetchItems = async () => {
    const table = itemType === 'product' ? 'products' : 'supplies';
    const { data } = await supabase
      .from(table)
      .select('id, name, sku')
      .eq('is_active', true)
      .order('name');
    setItems(data || []);
  };

  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || quantity <= 0) return;

    setLoading(true);

    try {
      const productId = itemType === 'product' ? selectedItemId : null;
      const supplyId = itemType === 'supply' ? selectedItemId : null;

      if (type === 'transfer') {
        // 출발지에서 차감
        const { data: fromInventory } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq(itemType === 'product' ? 'product_id' : 'supply_id', selectedItemId)
          .eq('location', location)
          .single();

        if (!fromInventory || fromInventory.quantity < quantity) {
          alert('출발지 재고가 부족합니다.');
          setLoading(false);
          return;
        }

        await supabase
          .from('inventory')
          .update({ quantity: fromInventory.quantity - quantity })
          .eq('id', fromInventory.id);

        // 이력 기록 (출고)
        await supabase.from('inventory_logs').insert({
          inventory_id: fromInventory.id,
          change_type: 'transfer' as InventoryChangeType,
          change_qty: -quantity,
          reason: `${locationLabels[location]} → ${locationLabels[toLocation]} 이동`,
        });

        // 도착지에 추가
        const { data: toInventory } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq(itemType === 'product' ? 'product_id' : 'supply_id', selectedItemId)
          .eq('location', toLocation)
          .single();

        if (toInventory) {
          await supabase
            .from('inventory')
            .update({ quantity: toInventory.quantity + quantity })
            .eq('id', toInventory.id);

          await supabase.from('inventory_logs').insert({
            inventory_id: toInventory.id,
            change_type: 'transfer' as InventoryChangeType,
            change_qty: quantity,
            reason: `${locationLabels[location]} → ${locationLabels[toLocation]} 이동`,
          });
        } else {
          const { data: newInventory } = await supabase
            .from('inventory')
            .insert({
              product_id: productId,
              supply_id: supplyId,
              location: toLocation,
              quantity: quantity,
            })
            .select()
            .single();

          if (newInventory) {
            await supabase.from('inventory_logs').insert({
              inventory_id: newInventory.id,
              change_type: 'transfer' as InventoryChangeType,
              change_qty: quantity,
              reason: `${locationLabels[location]} → ${locationLabels[toLocation]} 이동`,
            });
          }
        }
      } else {
        // 입고/출고
        const { data: existingInventory } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq(itemType === 'product' ? 'product_id' : 'supply_id', selectedItemId)
          .eq('location', location)
          .single();

        const changeQty = type === 'in' ? quantity : -quantity;
        const changeType: InventoryChangeType = type === 'in' ? 'in' : 'out';

        if (existingInventory) {
          const newQty = existingInventory.quantity + changeQty;
          if (newQty < 0) {
            alert('재고가 부족합니다.');
            setLoading(false);
            return;
          }

          await supabase
            .from('inventory')
            .update({ quantity: newQty })
            .eq('id', existingInventory.id);

          await supabase.from('inventory_logs').insert({
            inventory_id: existingInventory.id,
            change_type: changeType,
            change_qty: changeQty,
            reason: reason || (type === 'in' ? '입고' : '출고'),
          });
        } else if (type === 'in') {
          const { data: newInventory } = await supabase
            .from('inventory')
            .insert({
              product_id: productId,
              supply_id: supplyId,
              location: location,
              quantity: quantity,
            })
            .select()
            .single();

          if (newInventory) {
            await supabase.from('inventory_logs').insert({
              inventory_id: newInventory.id,
              change_type: changeType,
              change_qty: quantity,
              reason: reason || '입고',
            });
          }
        } else {
          alert('해당 위치에 재고가 없습니다.');
          setLoading(false);
          return;
        }
      }

      onSuccess();
    } catch (error) {
      console.error('Error:', error);
      alert('처리 중 오류가 발생했습니다.');
    }

    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{modalTitles[type]}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 상품/부자재 검색 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {itemType === 'product' ? '상품' : '부자재'} 선택
            </label>
            <input
              type="text"
              placeholder="이름 또는 SKU 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              required
              className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">선택하세요</option>
              {filteredItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.sku})
                </option>
              ))}
            </select>
          </div>

          {/* 수량 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">수량</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 위치 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {type === 'transfer' ? '출발 위치' : '위치'}
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value as InventoryLocation)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {Object.entries(locationLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* 도착 위치 (이동시만) */}
          {type === 'transfer' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">도착 위치</label>
              <select
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value as InventoryLocation)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Object.entries(locationLabels)
                  .filter(([key]) => key !== location)
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* 사유 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">사유 (선택)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="입고/출고 사유"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 버튼 */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading || !selectedItemId}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? '처리중...' : '확인'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
