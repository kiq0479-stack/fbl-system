'use client';

import { useState, useRef, useCallback } from 'react';

// ============================================================
// 상품 정의 — DB 창고 재고 기준
// ============================================================
type ProductDef = { key: string; full: string; brand: '키들' | '쉴트' | '기타'; bg: string; fg: string };

const PRODUCTS: ProductDef[] = [
  // 키들 (DB 창고 재고에 있는 상품)
  { key: '기저귀', full: '기저귀 갈이대',     brand: '키들', bg: '#fb7185', fg: '#fff' },
  { key: 'B3책',  full: '베이직 3단 책장',    brand: '키들', bg: '#38bdf8', fg: '#fff' },
  { key: 'B3',    full: '베이직 3단',         brand: '키들', bg: '#0ea5e9', fg: '#fff' },
  { key: 'B4책',  full: '베이직 4단 책장',    brand: '키들', bg: '#60a5fa', fg: '#fff' },
  { key: 'B4',    full: '베이직 4단',         brand: '키들', bg: '#3b82f6', fg: '#fff' },
  { key: '전면',  full: '전면 책장 책꽂이',    brand: '키들', bg: '#818cf8', fg: '#fff' },
  { key: '옷장',  full: '옷장',              brand: '키들', bg: '#f59e0b', fg: '#fff' },
  { key: '3화',   full: '3단 계단 화이트',    brand: '키들', bg: '#e2e8f0', fg: '#334155' },
  { key: '3브',   full: '3단 계단 브라운',    brand: '키들', bg: '#b45309', fg: '#fff' },
  { key: '2브',   full: '2단 계단 브라운',    brand: '키들', bg: '#d97706', fg: '#fff' },
  { key: '흔말',  full: '흔들말 브라운',      brand: '키들', bg: '#f97316', fg: '#fff' },
  // 쉴트 (편집 모달에서 선택 가능)
  { key: '캣휠',  full: '캣휠',              brand: '쉴트', bg: '#facc15', fg: '#713f12' },
  { key: '스팽',  full: '스팽글',             brand: '쉴트', bg: '#a78bfa', fg: '#fff' },
  { key: '그립',  full: '스마트 그립톡',      brand: '쉴트', bg: '#2dd4bf', fg: '#fff' },
  { key: '폰케',  full: '폰케이스',           brand: '쉴트', bg: '#99f6e4', fg: '#134e4a' },
  { key: '키링',  full: '키링류',             brand: '쉴트', bg: '#5eead4', fg: '#134e4a' },
  // 기타
  { key: '기타',  full: '기타 물품',          brand: '기타', bg: '#cbd5e1', fg: '#475569' },
  { key: '부자재', full: '부자재',            brand: '기타', bg: '#d8b4fe', fg: '#581c87' },
];

const P_MAP = Object.fromEntries(PRODUCTS.map(p => [p.key, p]));
const getP = (key: string) => P_MAP[key] || { key, full: key, brand: '기타' as const, bg: '#e5e7eb', fg: '#374151' };

const BRAND_ICONS: Record<string, string> = { '키들': '🧸', '쉴트': '🛡️', '기타': '📦' };
const BRAND_ORDER = ['키들', '쉴트', '기타'] as const;

// ============================================================
// 엑셀 레이아웃 — DB에 없는 항목은 빈칸 처리
// ============================================================
const _ = '';
type Row = { label: string; slots: string[] };
type Section = { rows: Row[]; passage?: boolean };

const INITIAL_SECTIONS: Section[] = [
  // === Rack A (3→2→1) ===
  { rows: [
    { label: 'A 3층', slots: [_,_,_,_,_,_, _,_,_,_,_,_,_,_] },
    { label: 'A 2층', slots: [_,_,_,_,_,_, _,_,_,_,_,_,_,'기저귀'] },
    { label: 'A 1층', slots: [_,_,_,_,_,_, '기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀'] },
  ], passage: true },

  // === Rack B (1→2→3) ===
  { rows: [
    { label: 'B 1층', slots: [_,_,_,_, '기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀', _,_] },
    { label: 'B 2층', slots: [_,_,_,_, _,_,_,_,_,_,_,_, _,_] },
    { label: 'B 3층', slots: [_,_,_,_, '기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀', _,_] },
  ] },

  // === Rack C (3→2→1) ===
  { rows: [
    { label: 'C 3층', slots: [_,_,_,_,_,_, 'B4책','B4책','B4책','B4책','B4책','B4책', _,_] },
    { label: 'C 2층', slots: [_,_,_,_,_,_,_,_,_, 'B4책','B4책','B4책', _,_] },
    { label: 'C 1층', slots: [_,_, '기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀', _,_] },
  ], passage: true },

  // === Rack D (1→2→3) ===
  { rows: [
    { label: 'D 1층', slots: [_,_,_,_, '기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀',_, _,_] },
    { label: 'D 2층', slots: [_,_,'3화','3화', _,_,_,_,_,_,_,_, _,_] },
    { label: 'D 3층', slots: [_,_, '3화','3화','3화',_,_, 'B4','B4','B4','B4','B4', _,_] },
  ] },

  // === Rack E (3→2→1) ===
  { rows: [
    { label: 'E 3층', slots: [_, '2브','3브','3브', _,_, 'B3책','B3책','B3책','B3책','B3책','B3책', _,_] },
    { label: 'E 2층', slots: [_,_,'3브','3브', 'B3책','B3책','B3책','B3책','B3책','B3책','B3책','B3책', _,_] },
    { label: 'E 1층', slots: [_,_,_,_, 'B3책','B3책',_, 'B3책','B3책','B3책','B3책','B3책', _,_] },
  ], passage: true },

  // === Rack F (1→2→3) ===
  { rows: [
    { label: 'F 1층', slots: [_,_,_,_, _,_,_, 'B3',_,_,_,_, _,_] },
    { label: 'F 2층', slots: [_,_,'전면','전면', _, 'B3','B3','B3','B3','B3','B3','B3', _,_] },
    { label: 'F 3층', slots: ['전면','전면',_,_, 'B3','B3','B3','B3','B3','B3','B3','B3', _,_] },
  ] },

  // === Rack G (3→2→1) ===
  { rows: [
    { label: 'G 3층', slots: [_,_,_,_,_,_, '흔말','흔말','흔말','흔말','흔말','흔말', _,_] },
    { label: 'G 2층', slots: [_,_,_,_,_,_,_,_, '흔말','흔말','흔말','흔말', _,_] },
    { label: 'G 1층', slots: [_,_,_,_, '흔말',_,_,_,_,_,_,_, _,_] },
  ], passage: true },

  // === Rack H (1→2→3) ===
  { rows: [
    { label: 'H 1층', slots: ['기저귀','기저귀','기저귀','기저귀','기저귀','기저귀', _,_,_,_,_,_,_,_] },
    { label: 'H 2층', slots: [_,_,_,_, '옷장','옷장','옷장','옷장','옷장','옷장', _,_,_,_] },
    { label: 'H 3층', slots: ['옷장','옷장','옷장','옷장','옷장','옷장','옷장','옷장','옷장','옷장','옷장','옷장','옷장','옷장'] },
  ] },
];

function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)); }

// ============================================================
// 브랜드별 요약
// ============================================================
type ProductSummary = { key: string; full: string; count: number; bg: string; fg: string };
type BrandSummary = { brand: string; icon: string; total: number; products: ProductSummary[] };

function getBrandSummary(sections: Section[]): BrandSummary[] {
  const map = new Map<string, number>();
  sections.forEach(sec => sec.rows.forEach(row => {
    row.slots.forEach(s => { if (s) map.set(s, (map.get(s) || 0) + 1); });
  }));

  const brandMap = new Map<string, ProductSummary[]>();
  BRAND_ORDER.forEach(b => brandMap.set(b, []));

  map.forEach((count, key) => {
    const p = getP(key);
    if (!brandMap.has(p.brand)) brandMap.set(p.brand, []);
    brandMap.get(p.brand)!.push({ key, full: p.full, count, bg: p.bg, fg: p.fg });
  });

  brandMap.forEach(products => products.sort((a, b) => b.count - a.count));

  return BRAND_ORDER.map(brand => ({
    brand, icon: BRAND_ICONS[brand],
    total: brandMap.get(brand)!.reduce((s, p) => s + p.count, 0),
    products: brandMap.get(brand)!,
  }));
}

// ============================================================
// 컴포넌트
// ============================================================
export default function RackMapPage() {
  const [sections, setSections] = useState<Section[]>(() => deepClone(INITIAL_SECTIONS));
  const [highlight, setHighlight] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ si: number; ri: number; slotIdx: number } | null>(null);
  const [expandedBrand, setExpandedBrand] = useState<string | null>('키들');
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const brandSummary = getBrandSummary(sections);
  const totalP = brandSummary.reduce((s, b) => s + b.total, 0);
  const totalSlots = sections.reduce((s, sec) => s + sec.rows.reduce((s2, r) => s2 + r.slots.length, 0), 0);

  const editSlot = editTarget ? {
    row: sections[editTarget.si].rows[editTarget.ri],
    slotIdx: editTarget.slotIdx,
    current: sections[editTarget.si].rows[editTarget.ri].slots[editTarget.slotIdx],
  } : null;

  const handleSlotChange = useCallback((productKey: string) => {
    if (!editTarget) return;
    setSections(prev => {
      const next = deepClone(prev);
      next[editTarget.si].rows[editTarget.ri].slots[editTarget.slotIdx] = productKey;
      return next;
    });
    setEditTarget(null);
  }, [editTarget]);

  const handleSlotClear = useCallback(() => {
    if (!editTarget) return;
    setSections(prev => {
      const next = deepClone(prev);
      next[editTarget.si].rows[editTarget.ri].slots[editTarget.slotIdx] = '';
      return next;
    });
    setEditTarget(null);
  }, [editTarget]);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">🏭 창고 랙 도면</h1>
        <p className="text-xs text-slate-400 mt-0.5">{totalP}P / {totalSlots}슬롯 ({Math.round(totalP/totalSlots*100)}%)</p>
      </div>

      {/* 브랜드별 요약 */}
      <div className="space-y-2">
        {brandSummary.filter(b => b.total > 0).map(b => (
          <div key={b.brand} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
              onClick={() => setExpandedBrand(expandedBrand === b.brand ? null : b.brand)}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{b.icon}</span>
                <span className="font-bold text-slate-900">{b.brand}</span>
                <span className="text-sm text-slate-500">{b.products.length}종</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-700">{b.total}P</span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandedBrand === b.brand ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {expandedBrand === b.brand && (
              <div className="border-t border-slate-100 px-3 py-2">
                <div className="flex flex-wrap gap-1.5">
                  {b.products.map(p => (
                    <button
                      key={p.key}
                      className={`text-[10px] sm:text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-all ${
                        highlight === p.key ? 'ring-2 ring-offset-1 ring-slate-900 scale-105' : ''
                      }`}
                      style={{ backgroundColor: p.bg, color: p.fg, borderColor: 'rgba(0,0,0,0.1)' }}
                      onClick={() => setHighlight(highlight === p.key ? null : p.key)}
                    >
                      {p.full} {p.count}P
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 도면 그리드 */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="min-w-[600px]">
          {sections.map((sec, si) => (
            <div key={si}>
              <div className="border-2 border-slate-500 rounded-lg overflow-hidden mb-1">
                {sec.rows.map((row, ri) => (
                  <div
                    key={ri}
                    ref={el => { if (el) rowRefs.current.set(row.label, el); }}
                    className={`grid items-stretch ${ri > 0 ? 'border-t border-red-300 border-dashed' : ''}`}
                    style={{ gridTemplateColumns: '52px repeat(14, 1fr) 52px' }}
                  >
                    <div className="bg-slate-100 border-r border-slate-300 flex items-center justify-center px-1 py-1.5">
                      <span className="text-[9px] sm:text-xs font-bold text-slate-700 whitespace-nowrap">{row.label}</span>
                    </div>

                    {row.slots.map((s, i) => {
                      const isEmpty = !s;
                      const p = !isEmpty ? getP(s) : null;
                      const isHi = highlight && s === highlight;
                      const isDim = highlight && s !== highlight && !isEmpty;

                      return (
                        <button
                          key={i}
                          className={`border-l border-slate-200 flex items-center justify-center py-1.5 px-0.5 min-h-[34px] sm:min-h-[40px] transition-all ${
                            isHi ? 'ring-2 ring-inset ring-slate-900 z-10' : ''
                          } ${isEmpty ? 'hover:bg-blue-50' : 'hover:brightness-90'}`}
                          style={{
                            backgroundColor: p ? p.bg : 'transparent',
                            color: p ? p.fg : '',
                            opacity: isDim ? 0.25 : 1,
                          }}
                          title={isEmpty ? `빈 슬롯 — 클릭하여 추가` : `${p!.full} — 클릭하여 편집`}
                          onClick={() => setEditTarget({ si, ri, slotIdx: i })}
                        >
                          {!isEmpty && (
                            <span className="text-[6px] sm:text-[8px] font-bold leading-none select-none text-center">{s}</span>
                          )}
                          {isEmpty && (
                            <span className="text-[8px] text-slate-300 select-none">+</span>
                          )}
                        </button>
                      );
                    })}

                    <div className="bg-slate-100 border-l border-slate-300 flex items-center justify-center px-1 py-1.5">
                      <span className="text-[9px] sm:text-xs font-bold text-slate-700 whitespace-nowrap">{row.label}</span>
                    </div>
                  </div>
                ))}
              </div>

              {sec.passage && (
                <div className="flex items-center justify-center py-1 mb-1">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-[10px]">▲</span>
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="w-3 h-3 border border-slate-300 rounded-sm" />
                      ))}
                    </div>
                    <span className="text-[10px]">▼</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 슬롯 편집 모달 */}
      {editSlot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={() => setEditTarget(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editSlot.row.label} · 슬롯 #{editSlot.slotIdx + 1}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editSlot.current ? `현재: ${getP(editSlot.current).full}` : '비어있음'}
                </p>
              </div>
              <button onClick={() => setEditTarget(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-3">
              {editSlot.current && (
                <button
                  onClick={handleSlotClear}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 transition-colors text-sm font-medium"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  비우기
                </button>
              )}

              {BRAND_ORDER.map(brand => {
                const items = PRODUCTS.filter(p => p.brand === brand);
                if (items.length === 0) return null;
                return (
                  <div key={brand}>
                    <div className="text-xs font-semibold text-slate-500 mb-1.5">
                      {BRAND_ICONS[brand]} {brand}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {items.map(p => (
                        <button
                          key={p.key}
                          className={`text-xs font-medium px-3 py-2 rounded-lg border transition-all text-left ${
                            editSlot.current === p.key ? 'ring-2 ring-slate-900 scale-[1.02]' : 'hover:scale-[1.02]'
                          }`}
                          style={{ backgroundColor: p.bg, color: p.fg, borderColor: 'rgba(0,0,0,0.1)' }}
                          onClick={() => handleSlotChange(p.key)}
                        >
                          {p.full}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
