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

type FloorData = {
  rack: string;
  floor: number;
  items: RackItem[];
  totalQty: number;
  totalPallets: number;
};

// 엑셀 기준 랙별 파렛트 슬롯 수 (floor별)
const RACK_SLOTS: Record<string, Record<number, number>> = {
  A: { 3: 12, 2: 12, 1: 12 },
  B: { 3: 10, 2: 10, 1: 10 },
  C: { 3: 10, 2: 10, 1: 10 },
  D: { 3: 12, 2: 12, 1: 12 },
  E: { 3: 12, 2: 12, 1: 12 },
  F: { 3: 12, 2: 12, 1: 12 },
  G: { 3: 12, 2: 12, 1: 12 },
  H: { 3: 14, 2: 14, 1: 14 },
};

// 랙 그룹 (통로로 구분)
const RACK_GROUPS = [
  ['A'],
  ['B', 'C'],
  ['D', 'E'],
  ['F', 'G'],
  ['H'],
];

const FLOORS = [3, 2, 1];

export default function RackMapPage() {
  const [floorData, setFloorData] = useState<Map<string, FloorData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedFloor, setSelectedFloor] = useState<FloorData | null>(null);
  const [unassigned, setUnassigned] = useState<RackItem[]>([]);
  const [stats, setStats] = useState({ totalPallets: 0, totalItems: 0, totalQty: 0, usedCells: 0, totalCells: 0 });
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

    const map = new Map<string, FloorData>();
    const noPosition: RackItem[] = [];

    // Initialize all cells
    Object.entries(RACK_SLOTS).forEach(([rack]) => {
      FLOORS.forEach(floor => {
        const key = `${rack}-${floor}`;
        map.set(key, { rack, floor, items: [], totalQty: 0, totalPallets: 0 });
      });
    });

    let totalPallets = 0;
    let totalItems = 0;
    let totalQty = 0;

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

      const match = item.rack_position.match(/^([A-Ha-h])\s*[-\s]?\s*([1-3])$/);
      if (match) {
        const rack = match[1].toUpperCase();
        const floor = parseInt(match[2]);
        const key = `${rack}-${floor}`;
        const cell = map.get(key);
        if (cell) {
          cell.items.push(rackItem);
          cell.totalQty += item.quantity;
          cell.totalPallets += item.pallet_count || 0;
          totalPallets += item.pallet_count || 0;
          totalItems++;
          totalQty += item.quantity;
        }
      } else {
        noPosition.push(rackItem);
      }
    });

    // Count total/used cells
    let totalCells = 0;
    let usedCells = 0;
    Object.entries(RACK_SLOTS).forEach(([rack]) => {
      FLOORS.forEach(floor => {
        const slots = RACK_SLOTS[rack][floor];
        totalCells += slots;
        const key = `${rack}-${floor}`;
        const cell = map.get(key);
        if (cell && cell.totalPallets > 0) {
          usedCells += cell.totalPallets;
        }
      });
    });

    setFloorData(map);
    setUnassigned(noPosition);
    setStats({ totalPallets, totalItems, totalQty, usedCells, totalCells });
    setLoading(false);
  };

  const getFloorFillRatio = (floor: FloorData, maxSlots: number) => {
    if (maxSlots === 0) return 0;
    return Math.min(floor.totalPallets / maxSlots, 1);
  };

  const getFloorColor = (ratio: number) => {
    if (ratio === 0) return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-400' };
    if (ratio < 0.3) return { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800' };
    if (ratio < 0.6) return { bg: 'bg-sky-50', border: 'border-sky-300', text: 'text-sky-800' };
    if (ratio < 0.85) return { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800' };
    return { bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-800' };
  };

  const getPalletBarColor = (ratio: number) => {
    if (ratio < 0.3) return 'bg-emerald-400';
    if (ratio < 0.6) return 'bg-sky-400';
    if (ratio < 0.85) return 'bg-amber-400';
    return 'bg-rose-500';
  };

  const getItemName = (item: RackItem) => item.product_name || item.supply_name || '(이름 없음)';
  const shortenName = (name: string, maxLen = 10) => name.length <= maxLen ? name : name.slice(0, maxLen) + '…';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-400">랙 도면 로딩중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">🏭 창고 랙 도면</h1>
        <button onClick={fetchRackData} className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          새로고침
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-xs text-slate-500">총 파렛트</div>
          <div className="text-2xl font-bold text-slate-900">{stats.totalPallets}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-xs text-slate-500">적재율</div>
          <div className="text-2xl font-bold text-slate-900">
            {stats.totalCells > 0 ? Math.round((stats.usedCells / stats.totalCells) * 100) : 0}%
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-xs text-slate-500">품목 수</div>
          <div className="text-2xl font-bold text-slate-900">{stats.totalItems}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-xs text-slate-500">총 수량</div>
          <div className="text-2xl font-bold text-slate-900">{stats.totalQty.toLocaleString()}</div>
        </div>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="text-slate-500 font-medium">적재율:</span>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-slate-100 border border-slate-300" /><span>비어있음</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-200 border border-emerald-400" /><span>~30%</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-sky-200 border border-sky-400" /><span>~60%</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-200 border border-amber-400" /><span>~85%</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-rose-200 border border-rose-400" /><span>85%+</span></div>
      </div>

      {/* 랙 도면 - 선반 스타일 */}
      <div className="space-y-6">
        {RACK_GROUPS.map((group, gi) => (
          <div key={gi}>
            {/* 그룹 헤더 */}
            {gi > 0 && (
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 border-t-2 border-dashed border-slate-300" />
                <span className="text-xs text-slate-400 font-medium px-2">통로</span>
                <div className="flex-1 border-t-2 border-dashed border-slate-300" />
              </div>
            )}

            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${group.length}, 1fr)` }}>
              {group.map(rack => {
                // 해당 랙의 전체 파렛트 수
                const rackTotal = FLOORS.reduce((sum, f) => {
                  const cell = floorData.get(`${rack}-${f}`);
                  return sum + (cell?.totalPallets || 0);
                }, 0);
                const rackSlots = FLOORS.reduce((sum, f) => sum + (RACK_SLOTS[rack]?.[f] || 0), 0);

                return (
                  <div key={rack} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    {/* 랙 헤더 */}
                    <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between">
                      <span className="text-lg font-bold">랙 {rack}</span>
                      <span className="text-sm opacity-80">{rackTotal}/{rackSlots}P</span>
                    </div>

                    {/* 층별 표시 (3층 → 1층, 위에서 아래) */}
                    <div className="divide-y divide-slate-100">
                      {FLOORS.map(floor => {
                        const key = `${rack}-${floor}`;
                        const cell = floorData.get(key)!;
                        const maxSlots = RACK_SLOTS[rack]?.[floor] || 12;
                        const ratio = getFloorFillRatio(cell, maxSlots);
                        const colors = getFloorColor(ratio);

                        return (
                          <button
                            key={key}
                            onClick={() => setSelectedFloor(cell)}
                            className={`w-full text-left p-3 transition-colors hover:bg-slate-50 cursor-pointer`}
                          >
                            {/* 층 라벨 + 파렛트 바 */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${colors.bg} ${colors.border} border ${colors.text}`}>
                                {floor}층
                              </span>
                              <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${getPalletBarColor(ratio)}`}
                                  style={{ width: `${ratio * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-500 font-medium min-w-[35px] text-right">
                                {cell.totalPallets}/{maxSlots}
                              </span>
                            </div>

                            {/* 아이템 목록 */}
                            {cell.items.length === 0 ? (
                              <div className="text-xs text-slate-300 pl-1">비어있음</div>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {cell.items.map(item => (
                                  <span
                                    key={item.id}
                                    className={`inline-flex items-center text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md ${
                                      item.supply_id
                                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                                    }`}
                                  >
                                    {shortenName(getItemName(item))}
                                    {(item.pallet_count || 0) > 0 && (
                                      <span className="ml-0.5 font-bold">×{item.pallet_count}</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 미배정 재고 */}
      {unassigned.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">
            ⚠️ 랙 위치 미배정 ({unassigned.length}건)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {unassigned.map(item => (
              <div key={item.id} className="text-xs bg-white rounded-lg px-3 py-2 border border-yellow-100 flex items-center justify-between">
                <span className="font-medium text-slate-800">{getItemName(item)}</span>
                <span className="text-yellow-600 font-medium">{item.quantity}개</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 셀 상세 모달 */}
      {selectedFloor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={() => setSelectedFloor(null)}>
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-100 p-4 sm:p-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  랙 {selectedFloor.rack} — {selectedFloor.floor}층
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  파렛트 {selectedFloor.totalPallets}개 / 슬롯 {RACK_SLOTS[selectedFloor.rack]?.[selectedFloor.floor] || '?'}개
                </p>
              </div>
              <button onClick={() => setSelectedFloor(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 sm:p-6">
              {selectedFloor.items.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">이 칸은 비어있습니다</p>
              ) : (
                <>
                  {/* 파렛트 슬롯 시각화 */}
                  <div className="mb-4">
                    <div className="text-xs text-slate-500 mb-2">파렛트 배치</div>
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        const maxSlots = RACK_SLOTS[selectedFloor.rack]?.[selectedFloor.floor] || 12;
                        const blocks: { name: string; count: number; isSupply: boolean }[] = [];
                        selectedFloor.items.forEach(item => {
                          const count = item.pallet_count || 1;
                          blocks.push({
                            name: getItemName(item),
                            count,
                            isSupply: !!item.supply_id,
                          });
                        });
                        const usedSlots = blocks.reduce((s, b) => s + b.count, 0);
                        const emptySlots = Math.max(0, maxSlots - usedSlots);

                        const colors = [
                          'bg-blue-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400',
                          'bg-violet-400', 'bg-cyan-400', 'bg-orange-400', 'bg-pink-400',
                        ];

                        const result: React.ReactElement[] = [];
                        blocks.forEach((block, bi) => {
                          for (let i = 0; i < block.count; i++) {
                            result.push(
                              <div
                                key={`${bi}-${i}`}
                                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${block.isSupply ? 'bg-purple-400' : colors[bi % colors.length]} flex items-center justify-center`}
                                title={`${block.name} (${i + 1}/${block.count})`}
                              >
                                <span className="text-[9px] sm:text-[10px] font-bold text-white drop-shadow">
                                  {block.name.charAt(0)}
                                </span>
                              </div>
                            );
                          }
                        });
                        for (let i = 0; i < emptySlots; i++) {
                          result.push(
                            <div key={`empty-${i}`} className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-slate-100 border-2 border-dashed border-slate-200" />
                          );
                        }
                        return result;
                      })()}
                    </div>
                  </div>

                  {/* 아이템 상세 리스트 */}
                  <div className="space-y-2">
                    {selectedFloor.items.map(item => (
                      <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{getItemName(item)}</div>
                          <div className="text-xs text-slate-500">
                            {item.product_sku || item.supply_sku || ''}
                            {item.supply_id && <span className="ml-1 text-purple-500">(부자재)</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
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
                  onClick={() => setSelectedFloor(null)}
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
