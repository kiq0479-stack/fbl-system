'use client';

import { useState } from 'react';

// 엑셀 "랙 도면" 시트 기준 하드코딩 (2026.01.26)
// 각 파렛트 슬롯을 개별 표시
type PalletSlot = {
  name: string;
  color: string;   // tailwind bg color
  textColor: string;
};

type FloorLayout = {
  rack: string;
  floor: number;
  slots: PalletSlot[];
  maxSlots: number;
};

// 상품별 컬러 매핑
const PRODUCT_COLORS: Record<string, { bg: string; text: string }> = {
  '기타 물품':     { bg: 'bg-gray-300', text: 'text-gray-800' },
  '캣휠':         { bg: 'bg-yellow-400', text: 'text-yellow-900' },
  '기저귀 갈이대':  { bg: 'bg-rose-400', text: 'text-white' },
  '팝업 용품':     { bg: 'bg-pink-300', text: 'text-pink-900' },
  '베이직 4단 책장': { bg: 'bg-blue-400', text: 'text-white' },
  '베이직 4단':     { bg: 'bg-blue-500', text: 'text-white' },
  '베이직 3단 책장': { bg: 'bg-sky-400', text: 'text-white' },
  '베이직 3단':     { bg: 'bg-sky-500', text: 'text-white' },
  '전면 책장':      { bg: 'bg-indigo-400', text: 'text-white' },
  '옷장':          { bg: 'bg-amber-500', text: 'text-white' },
  '3단 계단 화이트': { bg: 'bg-slate-200', text: 'text-slate-800' },
  '3단 계단 브라운': { bg: 'bg-amber-700', text: 'text-white' },
  '2단 계단 브라운': { bg: 'bg-amber-600', text: 'text-white' },
  '흔들말 브라운':   { bg: 'bg-orange-500', text: 'text-white' },
  '스팽글':        { bg: 'bg-violet-400', text: 'text-white' },
  '무선 충전 패드':  { bg: 'bg-emerald-400', text: 'text-white' },
  '무도 패드':      { bg: 'bg-emerald-300', text: 'text-emerald-900' },
  '불량 박스':      { bg: 'bg-red-200', text: 'text-red-800' },
  '낱개 박스':      { bg: 'bg-orange-200', text: 'text-orange-800' },
  '아크릴 부자재':   { bg: 'bg-purple-300', text: 'text-purple-900' },
  '키링류':        { bg: 'bg-teal-300', text: 'text-teal-900' },
  '그립톡':        { bg: 'bg-teal-400', text: 'text-white' },
  '폰케이스':      { bg: 'bg-teal-200', text: 'text-teal-900' },
  '부자재':        { bg: 'bg-purple-200', text: 'text-purple-900' },
  '기저귀 5개':     { bg: 'bg-rose-300', text: 'text-rose-900' },
};

const DEFAULT_COLOR = { bg: 'bg-gray-200', text: 'text-gray-700' };

function slot(name: string, count: number): PalletSlot[] {
  const c = PRODUCT_COLORS[name] || DEFAULT_COLOR;
  return Array(count).fill({ name, color: c.bg, textColor: c.text });
}

function emptySlots(count: number): PalletSlot[] {
  return Array(count).fill({ name: '', color: 'bg-white', textColor: '' });
}

// 엑셀 데이터 기준 전체 레이아웃
const RACK_LAYOUT: FloorLayout[] = [
  // Rack A
  { rack: 'A', floor: 3, maxSlots: 14,
    slots: [...slot('기타 물품', 4), ...emptySlots(3), ...slot('캣휠', 5), ...emptySlots(2)] },
  { rack: 'A', floor: 2, maxSlots: 14,
    slots: [...slot('기타 물품', 4), ...emptySlots(6), ...slot('기저귀 5개', 1), ...slot('기저귀 갈이대', 1), ...emptySlots(2)] },
  { rack: 'A', floor: 1, maxSlots: 14,
    slots: [...slot('기타 물품', 4), ...slot('기저귀 갈이대', 8), ...emptySlots(2)] },

  // Rack B
  { rack: 'B', floor: 1, maxSlots: 12,
    slots: [...slot('팝업 용품', 2), ...slot('기저귀 갈이대', 8), ...emptySlots(2)] },
  { rack: 'B', floor: 2, maxSlots: 12,
    slots: [...slot('기타 물품', 2), ...emptySlots(10)] },
  { rack: 'B', floor: 3, maxSlots: 12,
    slots: [...slot('기타 물품', 2), ...slot('기저귀 갈이대', 8), ...emptySlots(2)] },

  // Rack C
  { rack: 'C', floor: 3, maxSlots: 12,
    slots: [...emptySlots(4), ...slot('베이직 4단 책장', 6), ...emptySlots(2)] },
  { rack: 'C', floor: 2, maxSlots: 12,
    slots: [...emptySlots(7), ...slot('베이직 4단 책장', 3), ...emptySlots(2)] },
  { rack: 'C', floor: 1, maxSlots: 12,
    slots: [...slot('기저귀 갈이대', 10), ...emptySlots(2)] },

  // Rack D
  { rack: 'D', floor: 1, maxSlots: 12,
    slots: [...slot('무선 충전 패드', 3), ...slot('무도 패드', 1), ...slot('기저귀 갈이대', 7), ...emptySlots(1)] },
  { rack: 'D', floor: 2, maxSlots: 12,
    slots: [...slot('스팽글', 2), ...slot('3단 계단 화이트', 2), ...emptySlots(8)] },
  { rack: 'D', floor: 3, maxSlots: 12,
    slots: [...emptySlots(2), ...slot('3단 계단 화이트', 3), ...emptySlots(1), ...slot('베이직 4단', 5), ...emptySlots(1)] },

  // Rack E
  { rack: 'E', floor: 3, maxSlots: 12,
    slots: [...emptySlots(1), ...slot('2단 계단 브라운', 1), ...slot('3단 계단 브라운', 2), ...emptySlots(2), ...slot('베이직 3단 책장', 6)] },
  { rack: 'E', floor: 2, maxSlots: 12,
    slots: [...slot('스팽글', 2), ...slot('3단 계단 브라운', 2), ...slot('베이직 3단 책장', 8)] },
  { rack: 'E', floor: 1, maxSlots: 12,
    slots: [...slot('부자재', 4), ...slot('베이직 3단 책장', 2), ...emptySlots(1), ...slot('베이직 3단 책장', 5)] },

  // Rack F
  { rack: 'F', floor: 1, maxSlots: 12,
    slots: [...slot('키링류', 4), ...emptySlots(2), ...slot('베이직 3단', 1), ...slot('불량 박스', 4), ...emptySlots(1)] },
  { rack: 'F', floor: 2, maxSlots: 12,
    slots: [...slot('아크릴 부자재', 2), ...slot('전면 책장', 2), ...emptySlots(1), ...slot('베이직 3단', 7)] },
  { rack: 'F', floor: 3, maxSlots: 12,
    slots: [...slot('전면 책장', 2), ...emptySlots(2), ...slot('베이직 3단', 8)] },

  // Rack G
  { rack: 'G', floor: 3, maxSlots: 12,
    slots: [...emptySlots(4), ...slot('흔들말 브라운', 6), ...emptySlots(2)] },
  { rack: 'G', floor: 2, maxSlots: 12,
    slots: [...slot('아크릴 부자재', 2), ...slot('그립톡', 1), ...emptySlots(3), ...slot('흔들말 브라운', 4), ...emptySlots(2)] },
  { rack: 'G', floor: 1, maxSlots: 12,
    slots: [...slot('키링류', 1), ...slot('그립톡', 1), ...slot('그립톡', 1), ...slot('폰케이스', 1), ...slot('흔들말 브라운', 1), ...emptySlots(3), ...slot('불량 박스', 4)] },

  // Rack H
  { rack: 'H', floor: 1, maxSlots: 14,
    slots: [...slot('기저귀 갈이대', 6), ...emptySlots(2), ...slot('낱개 박스', 6)] },
  { rack: 'H', floor: 2, maxSlots: 14,
    slots: [...emptySlots(4), ...slot('옷장', 6), ...slot('낱개 박스', 4)] },
  { rack: 'H', floor: 3, maxSlots: 14,
    slots: [...slot('옷장', 14)] },
];

// 랙별로 그룹핑
const RACKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const RACK_GROUPS = [['A'], ['B', 'C'], ['D', 'E'], ['F', 'G'], ['H']];

// 상품별 요약 계산
function getProductSummary() {
  const summary = new Map<string, number>();
  RACK_LAYOUT.forEach(floor => {
    floor.slots.forEach(s => {
      if (s.name && s.name !== '') {
        summary.set(s.name, (summary.get(s.name) || 0) + 1);
      }
    });
  });
  return Array.from(summary.entries()).sort((a, b) => b[1] - a[1]);
}

export default function RackMapPage() {
  const [selectedFloor, setSelectedFloor] = useState<FloorLayout | null>(null);
  const [hoveredProduct, setHoveredProduct] = useState<string | null>(null);

  const productSummary = getProductSummary();
  const totalPallets = RACK_LAYOUT.reduce((sum, f) => sum + f.slots.filter(s => s.name).length, 0);
  const totalSlots = RACK_LAYOUT.reduce((sum, f) => sum + f.maxSlots, 0);

  const getFloorsByRack = (rack: string) => {
    return RACK_LAYOUT.filter(f => f.rack === rack).sort((a, b) => b.floor - a.floor);
  };

  // 간략 이름
  const shortName = (name: string) => {
    const map: Record<string, string> = {
      '기타 물품': '기타',
      '캣휠': '캣휠',
      '기저귀 갈이대': '기갈',
      '기저귀 5개': '기갈5',
      '팝업 용품': '팝업',
      '베이직 4단 책장': 'B4책',
      '베이직 4단': 'B4',
      '베이직 3단 책장': 'B3책',
      '베이직 3단': 'B3',
      '전면 책장': '전면',
      '옷장': '옷장',
      '3단 계단 화이트': '3W',
      '3단 계단 브라운': '3B',
      '2단 계단 브라운': '2B',
      '흔들말 브라운': '흔말',
      '스팽글': '스팽',
      '무선 충전 패드': '충전',
      '무도 패드': '무도',
      '불량 박스': '불량',
      '낱개 박스': '낱개',
      '아크릴 부자재': '아크',
      '키링류': '키링',
      '그립톡': '그립',
      '폰케이스': '폰케',
      '부자재': '부자',
    };
    return map[name] || name.slice(0, 2);
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">🏭 창고 랙 도면</h1>
          <p className="text-xs text-slate-400 mt-1">기준일: 2026.01.26 엑셀 데이터</p>
        </div>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-xs text-slate-500">총 파렛트</div>
          <div className="text-2xl font-bold text-slate-900">{totalPallets}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-xs text-slate-500">총 슬롯</div>
          <div className="text-2xl font-bold text-slate-900">{totalSlots}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-xs text-slate-500">적재율</div>
          <div className="text-2xl font-bold text-slate-900">{Math.round((totalPallets / totalSlots) * 100)}%</div>
        </div>
      </div>

      {/* 상품 범례 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="text-xs font-semibold text-slate-500 mb-2">상품별 파렛트 수</div>
        <div className="flex flex-wrap gap-1.5">
          {productSummary.map(([name, count]) => {
            const c = PRODUCT_COLORS[name] || DEFAULT_COLOR;
            return (
              <button
                key={name}
                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${
                  hoveredProduct === name ? 'ring-2 ring-offset-1 ring-slate-900 scale-105' : ''
                } ${c.bg} ${c.text} border-black/10`}
                onMouseEnter={() => setHoveredProduct(name)}
                onMouseLeave={() => setHoveredProduct(null)}
                onClick={() => setHoveredProduct(hoveredProduct === name ? null : name)}
              >
                <span className="font-medium">{name}</span>
                <span className="opacity-70">{count}P</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 도면 */}
      <div className="space-y-4">
        {RACK_GROUPS.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && (
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 border-t-2 border-dashed border-slate-300" />
                <span className="text-[10px] text-slate-400 font-medium tracking-wider">▲ 통로 ▼</span>
                <div className="flex-1 border-t-2 border-dashed border-slate-300" />
              </div>
            )}

            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${group.length}, 1fr)` }}>
              {group.map(rack => {
                const floors = getFloorsByRack(rack);
                const rackPallets = floors.reduce((s, f) => s + f.slots.filter(sl => sl.name).length, 0);
                const rackSlots = floors.reduce((s, f) => s + f.maxSlots, 0);

                return (
                  <div key={rack} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    {/* 랙 헤더 */}
                    <div className="bg-slate-800 text-white px-3 sm:px-4 py-2.5 flex items-center justify-between">
                      <span className="text-base sm:text-lg font-bold">랙 {rack}</span>
                      <span className="text-xs sm:text-sm opacity-80">{rackPallets}/{rackSlots}P</span>
                    </div>

                    {/* 층별 */}
                    <div className="divide-y divide-slate-100">
                      {floors.map(floor => {
                        const usedCount = floor.slots.filter(s => s.name).length;
                        const ratio = usedCount / floor.maxSlots;

                        return (
                          <div
                            key={`${rack}-${floor.floor}`}
                            className="p-2.5 sm:p-3 cursor-pointer hover:bg-slate-50 transition-colors"
                            onClick={() => setSelectedFloor(floor)}
                          >
                            {/* 층 라벨 */}
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-slate-600">{floor.floor}층</span>
                              <span className="text-[10px] text-slate-400">{usedCount}/{floor.maxSlots}</span>
                            </div>

                            {/* 파렛트 슬롯 그리드 */}
                            <div className="grid gap-[3px]" style={{
                              gridTemplateColumns: `repeat(${Math.min(floor.maxSlots, 14)}, 1fr)`
                            }}>
                              {floor.slots.map((s, i) => {
                                const isHighlighted = hoveredProduct && s.name === hoveredProduct;
                                const isDimmed = hoveredProduct && s.name !== hoveredProduct && s.name !== '';
                                const isEmpty = !s.name;

                                return (
                                  <div
                                    key={i}
                                    className={`aspect-square rounded-sm sm:rounded transition-all flex items-center justify-center ${
                                      isEmpty
                                        ? 'bg-slate-100 border border-dashed border-slate-200'
                                        : `${s.color} ${s.textColor} border border-black/5`
                                    } ${
                                      isHighlighted ? 'ring-2 ring-slate-900 scale-110 z-10' : ''
                                    } ${
                                      isDimmed ? 'opacity-30' : ''
                                    }`}
                                    title={s.name || '빈 슬롯'}
                                  >
                                    {!isEmpty && (
                                      <span className="text-[6px] sm:text-[8px] font-bold leading-none select-none">
                                        {shortName(s.name)}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
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

      {/* 셀 상세 모달 */}
      {selectedFloor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={() => setSelectedFloor(null)}>
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">랙 {selectedFloor.rack} — {selectedFloor.floor}층</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedFloor.slots.filter(s => s.name).length}/{selectedFloor.maxSlots} 슬롯 사용
                </p>
              </div>
              <button onClick={() => setSelectedFloor(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5">
              {/* 파렛트 시각화 (큰 버전) */}
              <div className="grid gap-1.5 mb-5" style={{
                gridTemplateColumns: `repeat(${Math.min(selectedFloor.maxSlots, 7)}, 1fr)`
              }}>
                {selectedFloor.slots.map((s, i) => {
                  const isEmpty = !s.name;
                  return (
                    <div
                      key={i}
                      className={`aspect-square rounded-lg flex flex-col items-center justify-center ${
                        isEmpty
                          ? 'bg-slate-50 border-2 border-dashed border-slate-200'
                          : `${s.color} ${s.textColor} border border-black/10 shadow-sm`
                      }`}
                    >
                      {!isEmpty && (
                        <>
                          <span className="text-[10px] sm:text-xs font-bold leading-tight">{shortName(s.name)}</span>
                          <span className="text-[8px] opacity-70 mt-0.5">#{i + 1}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 상품별 요약 */}
              <div className="space-y-2">
                {(() => {
                  const counts = new Map<string, number>();
                  selectedFloor.slots.forEach(s => {
                    if (s.name) counts.set(s.name, (counts.get(s.name) || 0) + 1);
                  });
                  return Array.from(counts.entries()).map(([name, count]) => {
                    const c = PRODUCT_COLORS[name] || DEFAULT_COLOR;
                    return (
                      <div key={name} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded ${c.bg}`} />
                          <span className="text-sm font-medium text-slate-900">{name}</span>
                        </div>
                        <span className="text-sm font-bold text-slate-700">{count}P</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
