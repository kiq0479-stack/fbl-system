'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

type RackItem = {
  id: string;
  product_id: string | null;
  supply_id: string | null;
  quantity: number;
  pallet_count: number | null;
  extra_boxes: number | null;
  rack_position: string;
  product_name: string | null;
  product_sku: string | null;
  supply_name: string | null;
  supply_sku: string | null;
};

type CellData = {
  rack: string;
  floor: number;
  items: RackItem[];
  totalQty: number;
  totalPallets: number;
};

const RACKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const FLOORS = [3, 2, 1]; // 위에서 아래로

export default function RackMapPage() {
  const [cells, setCells] = useState<Map<string, CellData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState<CellData | null>(null);
  const [unassigned, setUnassigned] = useState<RackItem[]>([]);
  const supabase = createClient();

  useEffect(() => {
    fetchRackData();
  }, []);

  const fetchRackData = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('inventory')
      .select(`
        id, product_id, supply_id, quantity, pallet_count, extra_boxes, rack_position,
        products (name, sku),
        supplies (name, sku)
      `)
      .eq('location', 'warehouse')
      .gt('quantity', 0);

    if (error) {
      console.error('Error:', error);
      setLoading(false);
      return;
    }

    const cellMap = new Map<string, CellData>();
    const noPosition: RackItem[] = [];

    // Initialize all cells
    RACKS.forEach(rack => {
      FLOORS.forEach(floor => {
        const key = `${rack}-${floor}`;
        cellMap.set(key, { rack, floor, items: [], totalQty: 0, totalPallets: 0 });
      });
    });

    (data || []).forEach((item: any) => {
      const rackItem: RackItem = {
        id: item.id,
        product_id: item.product_id,
        supply_id: item.supply_id,
        quantity: item.quantity,
        pallet_count: item.pallet_count,
        extra_boxes: item.extra_boxes,
        rack_position: item.rack_position || '',
        product_name: item.products?.name || null,
        product_sku: item.products?.sku || null,
        supply_name: item.supplies?.name || null,
        supply_sku: item.supplies?.sku || null,
      };

      if (!item.rack_position) {
        noPosition.push(rackItem);
        return;
      }

      // Parse rack_position: "A-1", "A-2", "B3", "C 1", etc.
      const match = item.rack_position.match(/^([A-Ha-h])\s*[-\s]?\s*([1-3])$/);
      if (match) {
        const rack = match[1].toUpperCase();
        const floor = parseInt(match[2]);
        const key = `${rack}-${floor}`;
        const cell = cellMap.get(key);
        if (cell) {
          cell.items.push(rackItem);
          cell.totalQty += item.quantity;
          cell.totalPallets += item.pallet_count || 0;
        }
      } else {
        noPosition.push(rackItem);
      }
    });

    setCells(cellMap);
    setUnassigned(noPosition);
    setLoading(false);
  };

  const getCellColor = (cell: CellData) => {
    if (cell.items.length === 0) return 'bg-slate-50 border-slate-200 text-slate-400';
    if (cell.totalPallets >= 8) return 'bg-red-50 border-red-300 text-red-900';
    if (cell.totalPallets >= 5) return 'bg-orange-50 border-orange-300 text-orange-900';
    if (cell.totalPallets >= 3) return 'bg-blue-50 border-blue-300 text-blue-900';
    return 'bg-green-50 border-green-300 text-green-900';
  };

  const getCellBadgeColor = (cell: CellData) => {
    if (cell.items.length === 0) return 'bg-slate-200 text-slate-500';
    if (cell.totalPallets >= 8) return 'bg-red-500 text-white';
    if (cell.totalPallets >= 5) return 'bg-orange-500 text-white';
    if (cell.totalPallets >= 3) return 'bg-blue-500 text-white';
    return 'bg-green-500 text-white';
  };

  const getItemName = (item: RackItem) => {
    return item.product_name || item.supply_name || '(이름 없음)';
  };

  const shortenName = (name: string, maxLen = 12) => {
    if (name.length <= maxLen) return name;
    return name.slice(0, maxLen) + '…';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">랙 도면 로딩중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">창고 랙 도면</h1>
        <button
          onClick={fetchRackData}
          className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
        >
          새로고침
        </button>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-slate-100 border border-slate-300" />
          <span className="text-slate-500">비어있음</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-100 border border-green-400" />
          <span className="text-slate-600">여유 (1~2P)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-blue-100 border border-blue-400" />
          <span className="text-slate-600">보통 (3~4P)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-orange-100 border border-orange-400" />
          <span className="text-slate-600">많음 (5~7P)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-100 border border-red-400" />
          <span className="text-slate-600">가득 (8P+)</span>
        </div>
      </div>

      {/* 그리드 도면 */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* 헤더: 층 */}
          <div className="grid grid-cols-[60px_1fr_1fr_1fr] gap-2 mb-2">
            <div className="text-center text-xs font-semibold text-slate-400 py-2">랙</div>
            {FLOORS.map(floor => (
              <div key={floor} className="text-center text-xs font-semibold text-slate-500 py-2 bg-slate-100 rounded-lg">
                {floor}층
              </div>
            ))}
          </div>

          {/* 각 랙 행 */}
          {RACKS.map(rack => (
            <div key={rack} className="grid grid-cols-[60px_1fr_1fr_1fr] gap-2 mb-2">
              {/* 랙 라벨 */}
              <div className="flex items-center justify-center">
                <span className="w-10 h-10 flex items-center justify-center bg-slate-800 text-white font-bold text-lg rounded-lg">
                  {rack}
                </span>
              </div>

              {/* 각 층 셀 */}
              {FLOORS.map(floor => {
                const key = `${rack}-${floor}`;
                const cell = cells.get(key)!;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedCell(cell)}
                    className={`relative border-2 rounded-xl p-3 min-h-[100px] text-left transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer ${getCellColor(cell)}`}
                  >
                    {/* 파렛트 수 배지 */}
                    {cell.items.length > 0 && (
                      <span className={`absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getCellBadgeColor(cell)}`}>
                        {cell.totalPallets}P
                      </span>
                    )}

                    {cell.items.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-sm">빈 칸</div>
                    ) : (
                      <div className="space-y-1">
                        {cell.items.slice(0, 3).map((item, i) => (
                          <div key={item.id} className="text-xs leading-tight">
                            <span className="font-medium">{shortenName(getItemName(item))}</span>
                            {(item.pallet_count || 0) > 0 && (
                              <span className="text-[10px] opacity-70 ml-1">×{item.pallet_count}</span>
                            )}
                            {item.quantity > 0 && !(item.pallet_count) && (
                              <span className="text-[10px] opacity-70 ml-1">({item.quantity}개)</span>
                            )}
                          </div>
                        ))}
                        {cell.items.length > 3 && (
                          <div className="text-[10px] opacity-60">+{cell.items.length - 3}개 더</div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 미배정 재고 */}
      {unassigned.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">
            ⚠️ 랙 위치 미배정 ({unassigned.length}건)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {unassigned.map(item => (
              <div key={item.id} className="text-xs bg-white rounded-lg px-3 py-2 border border-yellow-100">
                <span className="font-medium">{getItemName(item)}</span>
                <span className="text-yellow-600 ml-2">{item.quantity}개</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 셀 상세 모달 */}
      {selectedCell && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedCell(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900">
                  랙 {selectedCell.rack} - {selectedCell.floor}층
                </h2>
                <button onClick={() => setSelectedCell(null)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {selectedCell.items.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">이 칸은 비어있습니다</p>
              ) : (
                <>
                  <div className="flex gap-4 mb-4 text-sm">
                    <div className="bg-slate-100 rounded-lg px-3 py-2 text-center flex-1">
                      <div className="text-xs text-slate-500">파렛트</div>
                      <div className="font-bold text-slate-900">{selectedCell.totalPallets}</div>
                    </div>
                    <div className="bg-slate-100 rounded-lg px-3 py-2 text-center flex-1">
                      <div className="text-xs text-slate-500">총 수량</div>
                      <div className="font-bold text-slate-900">{selectedCell.totalQty.toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-100 rounded-lg px-3 py-2 text-center flex-1">
                      <div className="text-xs text-slate-500">품목 수</div>
                      <div className="font-bold text-slate-900">{selectedCell.items.length}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {selectedCell.items.map(item => (
                      <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {getItemName(item)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {item.product_sku || item.supply_sku || ''}
                            {item.supply_id && <span className="ml-1 text-purple-500">(부자재)</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          {(item.pallet_count || 0) > 0 && (
                            <div className="text-sm font-bold text-slate-900">{item.pallet_count}P</div>
                          )}
                          <div className="text-xs text-slate-500">{item.quantity.toLocaleString()}개</div>
                          {(item.extra_boxes || 0) > 0 && (
                            <div className="text-xs text-orange-500">+{item.extra_boxes}박스</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-4 pt-4 border-t border-slate-100">
                <Link
                  href="/logistics/inventory"
                  className="block text-center text-sm text-blue-600 font-medium hover:underline"
                  onClick={() => setSelectedCell(null)}
                >
                  재고 관리로 이동 →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
