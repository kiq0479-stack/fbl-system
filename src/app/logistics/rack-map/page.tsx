'use client';

import { useState } from 'react';

// 상품별 컬러
const C: Record<string, [string, string]> = {
  '기타':     ['#cbd5e1', '#475569'], // slate-300
  '캣휠':     ['#facc15', '#713f12'], // yellow-400
  '기저귀':   ['#fb7185', '#fff'],    // rose-400
  '기저5':    ['#fda4af', '#881337'], // rose-300 (기저귀갈이대 5개)
  '팝업':     ['#f9a8d4', '#831843'], // pink-300
  'B4책':     ['#60a5fa', '#fff'],    // blue-400
  'B4':       ['#3b82f6', '#fff'],    // blue-500
  'B3책':     ['#38bdf8', '#fff'],    // sky-400
  'B3':       ['#0ea5e9', '#fff'],    // sky-500
  '전면':     ['#818cf8', '#fff'],    // indigo-400
  '옷장':     ['#f59e0b', '#fff'],    // amber-500
  '3화':      ['#e2e8f0', '#334155'], // slate-200
  '3브':      ['#b45309', '#fff'],    // amber-700
  '2브':      ['#d97706', '#fff'],    // amber-600
  '흔말':     ['#f97316', '#fff'],    // orange-500
  '스팽':     ['#a78bfa', '#fff'],    // violet-400
  '충전':     ['#34d399', '#fff'],    // emerald-400
  '무도':     ['#6ee7b7', '#065f46'], // emerald-300
  '불량':     ['#fecaca', '#991b1b'], // red-200
  '낱개':     ['#fed7aa', '#9a3412'], // orange-200
  '아크':     ['#d8b4fe', '#581c87'], // purple-300
  'D키링':    ['#5eead4', '#134e4a'], // teal-300
  '집게':     ['#5eead4', '#134e4a'],
  '키링':     ['#5eead4', '#134e4a'],
  '새우':     ['#5eead4', '#134e4a'],
  '그립':     ['#2dd4bf', '#fff'],    // teal-400
  '폰케':     ['#99f6e4', '#134e4a'], // teal-200
  '장패':     ['#c4b5fd', '#4c1d95'], // violet-300
  '안경':     ['#c4b5fd', '#4c1d95'],
  '폴리':     ['#c4b5fd', '#4c1d95'],
  '포장':     ['#c4b5fd', '#4c1d95'],
};

const _ = ''; // empty slot

// 엑셀 "랙 도면" 시트 1:1 매칭 (2026.01.26)
// 각 행 = [label, slot×14, label]
// 층 순서: A(3→1), B(1→3), C(3→1), D(1→3), E(3→1), F(1→3), G(3→1), H(1→3)
type Row = { label: string; slots: string[] };
type Section = { rows: Row[]; passage?: boolean };

const SECTIONS: Section[] = [
  // === Rack A (3→2→1) ===
  { rows: [
    { label: 'A 3층', slots: [_,_, '기타','기타','기타','기타', _,_,_, '캣휠','캣휠','캣휠','캣휠','캣휠'] },
    { label: 'A 2층', slots: [_,_, '기타','기타','기타','기타', _,_,_,_,_,_, '기저5','기저귀'] },
    { label: 'A 1층', slots: [_,_, '기타','기타','기타','기타', '기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀'] },
  ], passage: true },

  // === Rack B (1→2→3) ===
  { rows: [
    { label: 'B 1층', slots: [_,_, '팝업','팝업', '기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀', _,_] },
    { label: 'B 2층', slots: [_,_, '기타','기타', _,_,_,_,_,_,_,_, _,_] },
    { label: 'B 3층', slots: [_,_, '기타','기타', '기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀', _,_] },
  ] },

  // === Rack C (3→2→1) ===
  { rows: [
    { label: 'C 3층', slots: [_,_,_,_,_,_, 'B4책','B4책','B4책','B4책','B4책','B4책', _,_] },
    { label: 'C 2층', slots: [_,_,_,_,_,_,_,_,_, 'B4책','B4책','B4책', _,_] },
    { label: 'C 1층', slots: [_,_, '기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀', _,_] },
  ], passage: true },

  // === Rack D (1→2→3) ===
  { rows: [
    { label: 'D 1층', slots: ['충전','충전','충전','무도', '기저귀','기저귀','기저귀','기저귀','기저귀','기저귀','기저귀',_, _,_] },
    { label: 'D 2층', slots: ['스팽','스팽','3화','3화', _,_,_,_,_,_,_,_, _,_] },
    { label: 'D 3층', slots: [_,_, '3화','3화','3화',_,_, 'B4','B4','B4','B4','B4', _,_] },
  ] },

  // === Rack E (3→2→1) ===
  { rows: [
    { label: 'E 3층', slots: [_, '2브','3브','3브', _,_, 'B3책','B3책','B3책','B3책','B3책','B3책', _,_] },
    { label: 'E 2층', slots: ['스팽','스팽','3브','3브', 'B3책','B3책','B3책','B3책','B3책','B3책','B3책','B3책', _,_] },
    { label: 'E 1층', slots: ['장패','안경','폴리','포장', 'B3책','B3책',_, 'B3책','B3책','B3책','B3책','B3책', _,_] },
  ], passage: true },

  // === Rack F (1→2→3) ===
  { rows: [
    { label: 'F 1층', slots: ['D키링','집게','키링','새우', _,_,_, 'B3','불량','불량','불량','불량', _,_] },
    { label: 'F 2층', slots: ['아크','아크','전면','전면', _, 'B3','B3','B3','B3','B3','B3','B3', _,_] },
    { label: 'F 3층', slots: ['전면','전면',_,_, 'B3','B3','B3','B3','B3','B3','B3','B3', _,_] },
  ] },

  // === Rack G (3→2→1) ===
  { rows: [
    { label: 'G 3층', slots: [_,_,_,_,_,_, '흔말','흔말','흔말','흔말','흔말','흔말', _,_] },
    { label: 'G 2층', slots: ['아크','아크','그립', _,_,_,_,_, '흔말','흔말','흔말','흔말', _,_] },
    { label: 'G 1층', slots: ['D키링','그립','그립','폰케', '흔말',_,_,_, '불량','불량','불량','불량', _,_] },
  ], passage: true },

  // === Rack H (1→2→3) ===
  { rows: [
    { label: 'H 1층', slots: ['기저귀','기저귀','기저귀','기저귀','기저귀','기저귀', _,_, '낱개','낱개','낱개','낱개','낱개','낱개'] },
    { label: 'H 2층', slots: [_,_,_,_, '옷장','옷장','옷장','옷장','옷장','옷장', '낱개','낱개','낱개','낱개'] },
    { label: 'H 3층', slots: ['옷장','옷장','옷장','옷장','옷장','옷장','옷장','옷장','옷장','옷장','옷장','옷장','옷장','옷장'] },
  ] },
];

// 상품 풀네임 매핑
const FULL_NAMES: Record<string, string> = {
  '기타': '기타 물품', '캣휠': '캣휠', '기저귀': '기저귀 갈이대', '기저5': '기저귀 갈이대 5개',
  '팝업': '팝업스토어 용품', 'B4책': '베이직 4단 책장', 'B4': '베이직 4단', 'B3책': '베이직 3단 책장',
  'B3': '베이직 3단', '전면': '전면 책장 책꽂이', '옷장': '옷장', '3화': '3단 계단 화이트',
  '3브': '3단 계단 브라운', '2브': '2단 계단 브라운', '흔말': '흔들말 브라운', '스팽': '스팽글',
  '충전': '무선 충전 패드', '무도': '무도 패드', '불량': '불량 박스', '낱개': '낱개 박스',
  '아크': '아크릴 부자재', 'D키링': 'D키링', '집게': '집게/양면/자석', '키링': '키링 스프링',
  '새우': '새우형/고급/화실 키링', '그립': '스마트 그립톡', '폰케': '폰케이스',
  '장패': '장패드/단패드', '안경': '안경닦기/털쿠션', '폴리': '폴리쿠션', '포장': '포장박스',
};

// 요약 계산
function getSummary() {
  const map = new Map<string, number>();
  let total = 0;
  let totalSlots = 0;
  SECTIONS.forEach(sec => sec.rows.forEach(row => {
    totalSlots += row.slots.length;
    row.slots.forEach(s => {
      if (s) { map.set(s, (map.get(s) || 0) + 1); total++; }
    });
  }));
  return { items: Array.from(map.entries()).sort((a, b) => b[1] - a[1]), total, totalSlots };
}

export default function RackMapPage() {
  const [highlight, setHighlight] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const { items: summary, total, totalSlots } = getSummary();

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">🏭 창고 랙 도면</h1>
          <p className="text-xs text-slate-400 mt-0.5">기준: 2026.01.26 · {total}P / {totalSlots}슬롯 ({Math.round(total/totalSlots*100)}%)</p>
        </div>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-1">
        {summary.map(([key, count]) => {
          const [bg, fg] = C[key] || ['#e5e7eb', '#374151'];
          return (
            <button
              key={key}
              className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-medium transition-all border border-black/10 ${
                highlight === key ? 'ring-2 ring-slate-900 scale-105' : ''
              }`}
              style={{ backgroundColor: bg, color: fg }}
              onClick={() => setHighlight(highlight === key ? null : key)}
            >
              {FULL_NAMES[key] || key} {count}P
            </button>
          );
        })}
      </div>

      {/* 도면 그리드 (엑셀 1:1) */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="min-w-[600px]">
          {SECTIONS.map((sec, si) => (
            <div key={si}>
              <div className="border border-slate-300 rounded-lg overflow-hidden mb-1">
                {sec.rows.map((row, ri) => (
                  <div
                    key={ri}
                    className={`grid items-stretch cursor-pointer hover:bg-slate-50/50 transition-colors ${
                      ri > 0 ? 'border-t border-red-300 border-dashed' : ''
                    }`}
                    style={{ gridTemplateColumns: '56px repeat(14, 1fr) 56px' }}
                    onClick={() => setSelectedRow(row)}
                  >
                    {/* 좌측 라벨 */}
                    <div className="bg-slate-100 border-r border-slate-300 flex items-center justify-center px-1 py-2">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-700 whitespace-nowrap">{row.label}</span>
                    </div>

                    {/* 슬롯 14칸 */}
                    {row.slots.map((s, i) => {
                      const isEmpty = !s;
                      const [bg, fg] = !isEmpty ? (C[s] || ['#e5e7eb', '#374151']) : ['transparent', ''];
                      const isHi = highlight && s === highlight;
                      const isDim = highlight && s !== highlight && !isEmpty;

                      return (
                        <div
                          key={i}
                          className={`border-l border-slate-200 flex items-center justify-center py-2 px-0.5 min-h-[36px] sm:min-h-[44px] transition-all ${
                            isHi ? 'ring-2 ring-inset ring-slate-900 z-10' : ''
                          }`}
                          style={{
                            backgroundColor: isEmpty ? 'transparent' : bg,
                            color: isEmpty ? '' : fg,
                            opacity: isDim ? 0.25 : 1,
                          }}
                          title={isEmpty ? '' : (FULL_NAMES[s] || s)}
                        >
                          {!isEmpty && (
                            <span className="text-[7px] sm:text-[9px] font-bold leading-none select-none text-center break-keep">
                              {s}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* 우측 라벨 */}
                    <div className="bg-slate-100 border-l border-slate-300 flex items-center justify-center px-1 py-2">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-700 whitespace-nowrap">{row.label}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 통로 */}
              {sec.passage && (
                <div className="flex items-center justify-center py-1.5 mb-1">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-[10px]">▲</span>
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="w-3 h-3 sm:w-4 sm:h-4 border border-slate-300 rounded-sm" />
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

      {/* 행 상세 모달 */}
      {selectedRow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={() => setSelectedRow(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{selectedRow.label}</h2>
              <button onClick={() => setSelectedRow(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5">
              {/* 큰 파렛트 그리드 */}
              <div className="grid grid-cols-7 gap-1.5 mb-4">
                {selectedRow.slots.map((s, i) => {
                  const isEmpty = !s;
                  const [bg, fg] = !isEmpty ? (C[s] || ['#e5e7eb', '#374151']) : ['#f1f5f9', '#94a3b8'];
                  return (
                    <div
                      key={i}
                      className="aspect-square rounded-lg flex flex-col items-center justify-center border"
                      style={{
                        backgroundColor: isEmpty ? '#f8fafc' : bg,
                        color: isEmpty ? '#94a3b8' : fg,
                        borderColor: isEmpty ? '#e2e8f0' : 'rgba(0,0,0,0.1)',
                        borderStyle: isEmpty ? 'dashed' : 'solid',
                      }}
                    >
                      {isEmpty ? (
                        <span className="text-[9px]">빈</span>
                      ) : (
                        <>
                          <span className="text-[10px] sm:text-xs font-bold">{s}</span>
                          <span className="text-[7px] opacity-60">#{i+1}</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 상품 요약 */}
              <div className="space-y-1.5">
                {(() => {
                  const counts = new Map<string, number>();
                  selectedRow.slots.forEach(s => { if (s) counts.set(s, (counts.get(s) || 0) + 1); });
                  return Array.from(counts.entries()).map(([key, count]) => {
                    const [bg] = C[key] || ['#e5e7eb'];
                    return (
                      <div key={key} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: bg }} />
                          <span className="text-sm font-medium text-slate-800">{FULL_NAMES[key] || key}</span>
                        </div>
                        <span className="text-sm font-bold text-slate-600">{count}P</span>
                      </div>
                    );
                  });
                })()}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-500">사용 / 전체</span>
                  <span className="text-sm font-bold text-slate-900">
                    {selectedRow.slots.filter(s => s).length} / {selectedRow.slots.length} 슬롯
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
