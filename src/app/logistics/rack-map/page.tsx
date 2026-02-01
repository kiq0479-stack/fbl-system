'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

// ============================================================
// 타입 정의
// ============================================================
type ProductDef = { key: string; full: string; brand: string; category?: string; bg: string; fg: string; type: 'product' | 'supply' };

type SlotItem = { key: string; qty: number };
type Row = { label: string; slots: SlotItem[][] };
type Section = { rows: Row[]; passage?: boolean };

type DbProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  type: 'product' | 'supply';
  quantity: number;
};

// ============================================================
// 하드코딩 PRODUCTS — fallback 스타일 레지스트리
// ============================================================
const HARDCODED_PRODUCTS: ProductDef[] = [
  // 키들
  { key: '기저귀', full: '기저귀 갈이대',     brand: '키들', bg: '#fb7185', fg: '#fff', type: 'product' },
  { key: 'B3책',  full: '베이직 3단 책장',    brand: '키들', bg: '#38bdf8', fg: '#fff', type: 'product' },
  { key: 'B3',    full: '베이직 3단',         brand: '키들', bg: '#0ea5e9', fg: '#fff', type: 'product' },
  { key: 'B4책',  full: '베이직 4단 책장',    brand: '키들', bg: '#60a5fa', fg: '#fff', type: 'product' },
  { key: 'B4',    full: '베이직 4단',         brand: '키들', bg: '#3b82f6', fg: '#fff', type: 'product' },
  { key: '전면',  full: '전면 책장 책꽂이',    brand: '키들', bg: '#818cf8', fg: '#fff', type: 'product' },
  { key: '옷장',  full: '옷장',              brand: '키들', bg: '#f59e0b', fg: '#fff', type: 'product' },
  { key: '3화',   full: '3단 계단 화이트',    brand: '키들', bg: '#e2e8f0', fg: '#334155', type: 'product' },
  { key: '3브',   full: '3단 계단 브라운',    brand: '키들', bg: '#b45309', fg: '#fff', type: 'product' },
  { key: '2브',   full: '2단 계단 브라운',    brand: '키들', bg: '#d97706', fg: '#fff', type: 'product' },
  { key: '흔말',  full: '흔들말 브라운',      brand: '키들', bg: '#f97316', fg: '#fff', type: 'product' },
  // 쉴트
  { key: '캣휠',  full: '캣휠',              brand: '쉴트', bg: '#facc15', fg: '#713f12', type: 'product' },
  { key: '스팽',  full: '스팽글',             brand: '쉴트', bg: '#a78bfa', fg: '#fff', type: 'product' },
  { key: '그립',  full: '스마트 그립톡',      brand: '쉴트', bg: '#2dd4bf', fg: '#fff', type: 'product' },
  { key: '폰케',  full: '폰케이스',           brand: '쉴트', bg: '#99f6e4', fg: '#134e4a', type: 'product' },
  { key: '키링',  full: '키링류',             brand: '쉴트', bg: '#5eead4', fg: '#134e4a', type: 'product' },
  // 기타
  { key: '기타',  full: '기타 물품',          brand: '기타', bg: '#cbd5e1', fg: '#475569', type: 'product' },
  { key: '부자재', full: '부자재',            brand: '기타', bg: '#d8b4fe', fg: '#581c87', type: 'supply' },
];

const HARDCODED_MAP = Object.fromEntries(HARDCODED_PRODUCTS.map(p => [p.key, p]));

// ============================================================
// 카테고리/브랜드 → 색상 자동 할당
// ============================================================
const CATEGORY_COLORS: Record<string, { bg: string; fg: string }> = {
  '키즈가구':  { bg: '#38bdf8', fg: '#fff' },
  '안전용품':  { bg: '#fb7185', fg: '#fff' },
  '펫용품':    { bg: '#facc15', fg: '#713f12' },
  '모바일액세서리': { bg: '#2dd4bf', fg: '#fff' },
  '생활용품':  { bg: '#a78bfa', fg: '#fff' },
  'supply':    { bg: '#d8b4fe', fg: '#581c87' },
};

const AUTO_PALETTE = [
  { bg: '#f87171', fg: '#fff' }, { bg: '#fb923c', fg: '#fff' },
  { bg: '#fbbf24', fg: '#713f12' }, { bg: '#a3e635', fg: '#1a2e05' },
  { bg: '#34d399', fg: '#fff' }, { bg: '#22d3ee', fg: '#164e63' },
  { bg: '#60a5fa', fg: '#fff' }, { bg: '#a78bfa', fg: '#fff' },
  { bg: '#f472b6', fg: '#fff' }, { bg: '#e879f9', fg: '#fff' },
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getAutoColor(category: string, sku: string): { bg: string; fg: string } {
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  return AUTO_PALETTE[hashStr(sku) % AUTO_PALETTE.length];
}

// ============================================================
// 통합 상품 조회 (하드코딩 + DB)
// ============================================================
function getP(key: string, dynamicMap: Map<string, ProductDef>): ProductDef {
  if (HARDCODED_MAP[key]) return HARDCODED_MAP[key];
  if (dynamicMap.has(key)) return dynamicMap.get(key)!;
  return { key, full: key, brand: '기타', bg: '#e5e7eb', fg: '#374151', type: 'product' };
}

const BRAND_ICONS: Record<string, string> = { '키들': '🧸', '쉴트': '🛡️', '부자재': '📦', '기타': '📦' };

// ============================================================
// 엑셀 레이아웃 — 슬롯당 복수 아이템 지원 (SlotItem[][])
// ============================================================
const E: SlotItem[] = [];    // 빈 슬롯
const S = (k: string, q = 1): SlotItem[] => [{ key: k, qty: q }]; // 단일 아이템 슬롯

const INITIAL_SECTIONS: Section[] = [
  // === Rack A (3→2→1) ===
  { rows: [
    { label: 'A 3층', slots: [E,E,E,E,E,E, E,E,E,E,E,E,E,E] },
    { label: 'A 2층', slots: [E,E,E,E,E,E, E,E,E,E,E,E,E,S('기저귀')] },
    { label: 'A 1층', slots: [E,E,E,E,E,E, S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀')] },
  ], passage: true },

  // === Rack B (1→2→3) ===
  { rows: [
    { label: 'B 1층', slots: [E,E,E,E, S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'), E,E] },
    { label: 'B 2층', slots: [E,E,E,E, E,E,E,E,E,E,E,E, E,E] },
    { label: 'B 3층', slots: [E,E,E,E, S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'), E,E] },
  ] },

  // === Rack C (3→2→1) ===
  { rows: [
    { label: 'C 3층', slots: [E,E,E,E,E,E, S('B4책'),S('B4책'),S('B4책'),S('B4책'),S('B4책'),S('B4책'), E,E] },
    { label: 'C 2층', slots: [E,E,E,E,E,E,E,E,E, S('B4책'),S('B4책'),S('B4책'), E,E] },
    { label: 'C 1층', slots: [E,E, S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'), E,E] },
  ], passage: true },

  // === Rack D (1→2→3) ===
  { rows: [
    { label: 'D 1층', slots: [E,E,E,E, S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),E, E,E] },
    { label: 'D 2층', slots: [E,E,S('3화'),S('3화'), E,E,E,E,E,E,E,E, E,E] },
    { label: 'D 3층', slots: [E,E, S('3화'),S('3화'),S('3화'),E,E, S('B4'),S('B4'),S('B4'),S('B4'),S('B4'), E,E] },
  ] },

  // === Rack E (3→2→1) ===
  { rows: [
    { label: 'E 3층', slots: [E, S('2브'),S('3브'),S('3브'), E,E, S('B3책'),S('B3책'),S('B3책'),S('B3책'),S('B3책'),S('B3책'), E,E] },
    { label: 'E 2층', slots: [E,E,S('3브'),S('3브'), S('B3책'),S('B3책'),S('B3책'),S('B3책'),S('B3책'),S('B3책'),S('B3책'),S('B3책'), E,E] },
    { label: 'E 1층', slots: [E,E,E,E, S('B3책'),S('B3책'),E, S('B3책'),S('B3책'),S('B3책'),S('B3책'),S('B3책'), E,E] },
  ], passage: true },

  // === Rack F (1→2→3) ===
  { rows: [
    { label: 'F 1층', slots: [E,E,E,E, E,E,E, S('B3'),E,E,E,E, E,E] },
    { label: 'F 2층', slots: [E,E,S('전면'),S('전면'), E, S('B3'),S('B3'),S('B3'),S('B3'),S('B3'),S('B3'),S('B3'), E,E] },
    { label: 'F 3층', slots: [S('전면'),S('전면'),E,E, S('B3'),S('B3'),S('B3'),S('B3'),S('B3'),S('B3'),S('B3'),S('B3'), E,E] },
  ] },

  // === Rack G (3→2→1) ===
  { rows: [
    { label: 'G 3층', slots: [E,E,E,E,E,E, S('흔말'),S('흔말'),S('흔말'),S('흔말'),S('흔말'),S('흔말'), E,E] },
    { label: 'G 2층', slots: [E,E,E,E,E,E,E,E, S('흔말'),S('흔말'),S('흔말'),S('흔말'), E,E] },
    { label: 'G 1층', slots: [E,E,E,E, S('흔말'),E,E,E,E,E,E,E, E,E] },
  ], passage: true },

  // === Rack H (1→2→3) ===
  { rows: [
    { label: 'H 1층', slots: [S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'),S('기저귀'), E,E,E,E,E,E,E,E] },
    { label: 'H 2층', slots: [E,E,E,E, S('옷장'),S('옷장'),S('옷장'),S('옷장'),S('옷장'),S('옷장'), E,E,E,E] },
    { label: 'H 3층', slots: [S('옷장'),S('옷장'),S('옷장'),S('옷장'),S('옷장'),S('옷장'),S('옷장'),S('옷장'),S('옷장'),S('옷장'),S('옷장'),S('옷장'),S('옷장'),S('옷장')] },
  ] },
];

function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)); }

// ============================================================
// 브랜드별 요약 (복수 아이템 슬롯 대응)
// ============================================================
type ProductSummary = { key: string; full: string; count: number; bg: string; fg: string };
type BrandSummary = { brand: string; icon: string; total: number; products: ProductSummary[] };

function getBrandSummary(sections: Section[], dynamicMap: Map<string, ProductDef>): BrandSummary[] {
  const map = new Map<string, number>();
  sections.forEach(sec => sec.rows.forEach(row => {
    row.slots.forEach(slot => {
      slot.forEach(item => { if (item.key) map.set(item.key, (map.get(item.key) || 0) + item.qty); });
    });
  }));

  const brandMap = new Map<string, ProductSummary[]>();
  const brandSet = new Set<string>();

  map.forEach((count, key) => {
    const p = getP(key, dynamicMap);
    brandSet.add(p.brand);
    if (!brandMap.has(p.brand)) brandMap.set(p.brand, []);
    brandMap.get(p.brand)!.push({ key, full: p.full, count, bg: p.bg, fg: p.fg });
  });

  brandMap.forEach(products => products.sort((a, b) => b.count - a.count));

  const brandOrder = ['키들', '쉴트', ...Array.from(brandSet).filter(b => b !== '키들' && b !== '쉴트').sort()];
  
  return brandOrder
    .filter(brand => brandMap.has(brand) && brandMap.get(brand)!.length > 0)
    .map(brand => ({
      brand,
      icon: BRAND_ICONS[brand] || '📦',
      total: brandMap.get(brand)!.reduce((s, p) => s + p.count, 0),
      products: brandMap.get(brand)!,
    }));
}

// ============================================================
// DB 상품 → 브랜드 추론
// ============================================================
function inferBrand(name: string, category: string): string {
  const n = name.toLowerCase();
  if (['베이직', '기저귀', '책장', '전면', '옷장', '계단', '흔들말', '갈이대'].some(k => n.includes(k))) return '키들';
  if (['캣휠', '스팽글', '그립톡', '폰케이스', '키링'].some(k => n.includes(k))) return '쉴트';
  if (category === '키즈가구' || category === '안전용품') return '키들';
  if (category === '펫용품' || category === '모바일액세서리') return '쉴트';
  return '기타';
}

// ============================================================
// 컴포넌트
// ============================================================
export default function RackMapPage() {
  const [sections, setSections] = useState<Section[]>(() => deepClone(INITIAL_SECTIONS));
  const [highlight, setHighlight] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ si: number; ri: number; slotIdx: number } | null>(null);
  const [expandedBrand, setExpandedBrand] = useState<string | null>('키들');
  const [dbProducts, setDbProducts] = useState<DbProduct[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [modalSearch, setModalSearch] = useState('');
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const [pendingQty, setPendingQty] = useState(1);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const supabase = createClient();

  // ── DB에서 창고 재고 상품 가져오기 ──
  useEffect(() => {
    const fetchWarehouseProducts = async () => {
      setDbLoading(true);
      try {
        // inventory + products + supplies 조인 쿼리
        const { data: invData } = await supabase
          .from('inventory')
          .select(`
            *,
            products (id, name, sku, category, is_active),
            supplies (id, name, sku)
          `)
          .eq('location', 'warehouse')
          .gt('quantity', 0);

        // 숨긴 상품 SKU 목록 가져오기
        let hiddenSkus = new Set<string>();
        try {
          const saved = localStorage.getItem('fbl-inventory-hidden');
          if (saved) hiddenSkus = new Set(JSON.parse(saved));
        } catch { /* ignore */ }

        const items: DbProduct[] = [];

        if (invData) {
          for (const inv of invData) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const row = inv as any;
            
            if (row.product_id && row.products) {
              const prod = row.products;
              if (!prod.is_active || hiddenSkus.has(prod.sku)) continue;
              items.push({
                id: prod.id,
                name: prod.name,
                sku: prod.sku,
                category: prod.category || '기타',
                type: 'product',
                quantity: row.quantity,
              });
            } else if (row.supply_id && row.supplies) {
              const sup = row.supplies;
              if (hiddenSkus.has(sup.sku)) continue;
              items.push({
                id: sup.id,
                name: sup.name,
                sku: sup.sku,
                category: 'supply',
                type: 'supply',
                quantity: row.quantity,
              });
            }
          }
        }

        setDbProducts(items);
      } catch (err) {
        console.error('Failed to fetch warehouse products:', err);
      } finally {
        setDbLoading(false);
      }
    };

    fetchWarehouseProducts();
  }, []);

  // ── DB 상품 → ProductDef 매핑 (동적 색상 포함) ──
  const dynamicProductMap = useMemo(() => {
    const map = new Map<string, ProductDef>();
    for (const item of dbProducts) {
      // 하드코딩에 이미 있으면 건너뛰기 (하드코딩 우선)
      if (HARDCODED_MAP[item.sku]) continue;

      const brand = item.type === 'supply' ? '부자재' : inferBrand(item.name, item.category);
      const color = getAutoColor(item.category, item.sku);
      map.set(item.sku, {
        key: item.sku,
        full: item.name,
        brand,
        category: item.category,
        bg: color.bg,
        fg: color.fg,
        type: item.type,
      });
    }
    return map;
  }, [dbProducts]);

  // ── 모달용: 브랜드/카테고리별로 그룹핑된 상품 목록 (DB 재고 상품만) ──
  const groupedModalProducts = useMemo(() => {
    const groups = new Map<string, ProductDef[]>();

    // DB 상품을 브랜드별로 그룹핑 (재고 있는 상품만)
    for (const item of dbProducts) {
      const existing = HARDCODED_MAP[item.sku];
      const brand = existing
        ? existing.brand
        : item.type === 'supply'
          ? '부자재'
          : inferBrand(item.name, item.category);

      if (!groups.has(brand)) groups.set(brand, []);

      const pDef: ProductDef = existing || dynamicProductMap.get(item.sku) || {
        key: item.sku,
        full: item.name,
        brand,
        bg: '#e5e7eb',
        fg: '#374151',
        type: item.type,
      };

      // 중복 방지
      if (!groups.get(brand)!.some(p => p.key === pDef.key)) {
        groups.get(brand)!.push(pDef);
      }
    }

    // ❌ 하드코딩 fallback 제거 — DB 재고 있는 상품만 표시

    // 브랜드 순서: 키들 → 쉴트 → 부자재 → 나머지
    const order = ['키들', '쉴트', '부자재', '기타'];
    const sorted = [...groups.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    return sorted;
  }, [dbProducts, dynamicProductMap]);

  const brandSummary = getBrandSummary(sections, dynamicProductMap);
  const totalP = brandSummary.reduce((s, b) => s + b.total, 0);
  const totalSlots = sections.reduce((s, sec) => s + sec.rows.reduce((s2, r) => s2 + r.slots.length, 0), 0);

  const editSlot = editTarget ? {
    row: sections[editTarget.si].rows[editTarget.ri],
    slotIdx: editTarget.slotIdx,
    current: sections[editTarget.si].rows[editTarget.ri].slots[editTarget.slotIdx],
  } : null;

  // ── 수량 입력 후 확인 → 슬롯에 추가 ──
  const handlePendingConfirm = useCallback(() => {
    if (!editTarget || !pendingAdd) return;

    const currentSlot = sections[editTarget.si].rows[editTarget.ri].slots[editTarget.slotIdx];
    const wasEmpty = currentSlot.length === 0;

    setSections(prev => {
      const next = deepClone(prev);
      const slot = next[editTarget.si].rows[editTarget.ri].slots[editTarget.slotIdx];

      if (slot.length === 0) {
        next[editTarget.si].rows[editTarget.ri].slots[editTarget.slotIdx] = [{ key: pendingAdd, qty: pendingQty }];
      } else {
        const existing = slot.find(item => item.key === pendingAdd);
        if (existing) {
          existing.qty += pendingQty;
        } else {
          slot.push({ key: pendingAdd, qty: pendingQty });
        }
      }
      return next;
    });

    setPendingAdd(null);
    setPendingQty(1);

    if (wasEmpty) {
      setEditTarget(null);
      setModalSearch('');
    }
  }, [editTarget, pendingAdd, pendingQty, sections]);

  // ── 슬롯에서 아이템 제거 ──
  const handleSlotRemove = useCallback((productKey: string) => {
    if (!editTarget) return;
    setSections(prev => {
      const next = deepClone(prev);
      const slot = next[editTarget.si].rows[editTarget.ri].slots[editTarget.slotIdx];
      const idx = slot.findIndex(item => item.key === productKey);
      if (idx !== -1) slot.splice(idx, 1);
      return next;
    });
  }, [editTarget]);

  // ── 슬롯 아이템 수량 변경 ──
  const handleSlotUpdateQty = useCallback((productKey: string, newQty: number) => {
    if (!editTarget || newQty < 1) return;
    setSections(prev => {
      const next = deepClone(prev);
      const slot = next[editTarget.si].rows[editTarget.ri].slots[editTarget.slotIdx];
      const item = slot.find(i => i.key === productKey);
      if (item) item.qty = newQty;
      return next;
    });
  }, [editTarget]);

  // ── 슬롯 전체 비우기 ──
  const handleSlotClear = useCallback(() => {
    if (!editTarget) return;
    setSections(prev => {
      const next = deepClone(prev);
      next[editTarget.si].rows[editTarget.ri].slots[editTarget.slotIdx] = [];
      return next;
    });
    setEditTarget(null);
  }, [editTarget]);

  // ── 모달 닫기 ──
  const handleModalClose = useCallback(() => {
    setEditTarget(null);
    setModalSearch('');
    setPendingAdd(null);
    setPendingQty(1);
  }, []);

  // ── 검색 필터링된 모달 상품 ──
  const filteredModalProducts = useMemo(() => {
    if (!modalSearch.trim()) return groupedModalProducts;
    const q = modalSearch.trim().toLowerCase();
    return groupedModalProducts
      .map(([brand, items]) => [brand, items.filter(p => 
        p.full.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)
      )] as [string, ProductDef[]])
      .filter(([, items]) => items.length > 0);
  }, [groupedModalProducts, modalSearch]);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">🏭 창고 랙 도면</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {totalP}P / {totalSlots}슬롯 ({Math.round(totalP/totalSlots*100)}%)
          {dbLoading && <span className="ml-2 text-blue-400">⏳ 상품 목록 로딩중...</span>}
        </p>
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
              <div className="border-2 border-slate-700 rounded-lg overflow-hidden mb-1">
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

                    {row.slots.map((slot, i) => {
                      const isEmpty = slot.length === 0;
                      const isMulti = slot.length > 1;
                      const firstItem = slot[0];
                      const p = firstItem ? getP(firstItem.key, dynamicProductMap) : null;
                      const isHi = highlight && slot.some(item => item.key === highlight);
                      const isDim = highlight && !slot.some(item => item.key === highlight) && !isEmpty;

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
                            ...(isMulti ? { 
                              background: `linear-gradient(135deg, ${getP(slot[0].key, dynamicProductMap).bg} 50%, ${getP(slot[1].key, dynamicProductMap).bg} 50%)`,
                            } : {}),
                          }}
                          title={isEmpty 
                            ? `빈 슬롯 — 클릭하여 추가` 
                            : isMulti
                              ? `${slot.map(item => `${getP(item.key, dynamicProductMap).full} ×${item.qty}`).join(' + ')} — 클릭하여 편집`
                              : `${p!.full} ×${firstItem.qty} — 클릭하여 편집`
                          }
                          onClick={() => setEditTarget({ si, ri, slotIdx: i })}
                        >
                          {!isEmpty && !isMulti && (
                            <span className="text-[6px] sm:text-[8px] font-bold leading-tight select-none text-center">
                              {firstItem.key}
                              {firstItem.qty > 1 && (
                                <span className="block text-[5px] sm:text-[7px] opacity-80">×{firstItem.qty}</span>
                              )}
                            </span>
                          )}
                          {isMulti && (
                            <span className="text-[6px] sm:text-[8px] font-bold leading-none select-none text-center">
                              {slot.length}종
                            </span>
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
                <div className="flex items-center justify-center py-4 mb-1">
                  <span className="text-xs text-slate-400 font-medium tracking-widest">— 통로 —</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 슬롯 편집 모달 */}
      {editSlot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={handleModalClose}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {editSlot.row.label} · 슬롯 #{editSlot.slotIdx + 1}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {editSlot.current.length === 0 
                      ? '비어있음'
                      : `${editSlot.current.length}개 아이템`
                    }
                  </p>
                </div>
                <button onClick={handleModalClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 현재 슬롯 아이템 표시 (수량 조절 포함) */}
              {editSlot.current.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {editSlot.current.map((item, idx) => {
                    const p = getP(item.key, dynamicProductMap);
                    return (
                      <div key={`${item.key}-${idx}`} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border" style={{ backgroundColor: p.bg + '20', borderColor: p.bg }}>
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.bg }} />
                        <span className="text-xs font-medium text-slate-800 flex-1">{p.full}</span>
                        {/* 수량 조절 */}
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => handleSlotUpdateQty(item.key, item.qty - 1)}
                            disabled={item.qty <= 1}
                            className="w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent text-xs font-bold"
                          >
                            −
                          </button>
                          <span className="text-xs font-bold text-slate-700 w-5 text-center">{item.qty}</span>
                          <button
                            onClick={() => handleSlotUpdateQty(item.key, item.qty + 1)}
                            className="w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:bg-slate-200 text-xs font-bold"
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={() => handleSlotRemove(item.key)}
                          className="text-red-400 hover:text-red-600 p-0.5 ml-1"
                          title="제거"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 수량 입력 패널 (상품 클릭 후 표시) */}
              {pendingAdd && (() => {
                const pDef = getP(pendingAdd, dynamicProductMap);
                return (
                  <div className="mt-3 p-3 rounded-xl border-2 border-blue-300 bg-blue-50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: pDef.bg }} />
                      <span className="text-sm font-semibold text-slate-800">{pDef.full}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">수량</span>
                      <button
                        onClick={() => setPendingQty(q => Math.max(1, q - 1))}
                        disabled={pendingQty <= 1}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 text-sm font-bold"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={pendingQty}
                        onChange={e => setPendingQty(Math.max(1, parseInt(e.target.value) || 1))}
                        onKeyDown={e => { if (e.key === 'Enter') handlePendingConfirm(); if (e.key === 'Escape') { setPendingAdd(null); setPendingQty(1); } }}
                        className="w-14 h-7 text-center text-sm font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={() => setPendingQty(q => q + 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 text-sm font-bold"
                      >
                        +
                      </button>
                      <button
                        onClick={handlePendingConfirm}
                        className="ml-auto px-3 h-7 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                      >
                        추가
                      </button>
                      <button
                        onClick={() => { setPendingAdd(null); setPendingQty(1); }}
                        className="px-2 h-7 rounded-lg border border-slate-300 text-slate-500 text-xs hover:bg-slate-100 transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* 검색 */}
              <div className="mt-3 relative">
                <input
                  type="text"
                  placeholder="상품 검색..."
                  value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 pl-8 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {/* 전체 비우기 */}
              {editSlot.current.length > 0 && (
                <button
                  onClick={handleSlotClear}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 transition-colors text-sm font-medium"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  전체 비우기
                </button>
              )}

              {/* DB 로딩 상태 */}
              {dbLoading && (
                <div className="text-center py-4 text-sm text-slate-400">
                  ⏳ 상품 목록을 불러오는 중...
                </div>
              )}

              {/* 상품 목록 — 브랜드별 그룹 (색상 제거, 심플 스타일) */}
              {filteredModalProducts.map(([brand, items]) => {
                if (items.length === 0) return null;
                return (
                  <div key={brand}>
                    <div className="text-xs font-semibold text-slate-500 mb-1.5">
                      {BRAND_ICONS[brand] || '📦'} {brand}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {items.map(p => {
                        const isInSlot = editSlot.current.some(item => item.key === p.key);
                        const dbItem = dbProducts.find(d => d.sku === p.key);
                        const isPending = pendingAdd === p.key;
                        return (
                          <button
                            key={p.key}
                            className={`text-xs font-medium px-3 py-2 rounded-lg border transition-all text-left relative ${
                              isPending
                                ? 'ring-2 ring-blue-500 border-blue-300 bg-blue-50'
                                : isInSlot
                                  ? 'ring-2 ring-green-500 border-green-300 bg-green-50 scale-[1.02]'
                                  : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-100'
                            }`}
                            onClick={() => {
                              if (isInSlot) {
                                // 이미 있으면 제거
                                handleSlotRemove(p.key);
                              } else {
                                // 수량 입력 패널 표시
                                setPendingAdd(p.key);
                                setPendingQty(1);
                              }
                            }}
                          >
                            <span className={isInSlot ? 'text-green-800' : 'text-slate-800'}>{p.full}</span>
                            {dbItem && (
                              <span className={`block text-[10px] mt-0.5 ${isInSlot ? 'text-green-600' : 'text-slate-400'}`}>
                                재고 {dbItem.quantity}
                              </span>
                            )}
                            {isInSlot && (
                              <span className="absolute top-1 right-1 text-[10px] text-green-600">✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {filteredModalProducts.length === 0 && !dbLoading && (
                <div className="text-center py-4 text-sm text-slate-400">
                  검색 결과가 없습니다
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
