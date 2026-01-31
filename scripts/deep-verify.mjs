#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
  console.log('══════════════════════════════════════════════════');
  console.log('  FBL 데이터 정밀 검증 — 캣휠 + 전체 파이프라인');
  console.log('══════════════════════════════════════════════════\n');

  // ─── 1. products 테이블: 캣휠 관련 상품 ───
  const { data: allProds } = await sb.from('products').select('*');
  const catProds = allProds?.filter(p => p.name?.includes('캣휠'));
  
  console.log('━━━ 1. products 테이블 캣휠 상품 ━━━');
  catProds?.forEach(p => {
    console.log(`  id: ${p.id}`);
    console.log(`  name: ${p.name}`);
    console.log(`  sku: ${p.sku}`);
    console.log(`  barcode: ${p.barcode || '없음'}`);
    const cols = Object.keys(p).filter(k => k.includes('coupang') || k.includes('vendor') || k.includes('naver') || k.includes('mapping'));
    cols.forEach(c => console.log(`  ${c}: ${p[c]}`));
    console.log('');
  });

  // ─── 2. product_mappings 확인 ───
  console.log('━━━ 2. product_mappings 테이블 ━━━');
  const { data: allMaps, error: mapErr } = await sb.from('product_mappings').select('*').limit(500);
  if (mapErr) {
    console.log('  product_mappings 테이블 에러:', mapErr.message);
    // 다른 매핑 방식 확인
    const { data: prodCols } = await sb.from('products').select('*').limit(1);
    if (prodCols?.[0]) console.log('  products 컬럼:', Object.keys(prodCols[0]).join(', '));
  } else {
    const catMaps = allMaps?.filter(m => 
      m.product_name?.includes('캣휠') || m.vendor_item_name?.includes('캣휠') || 
      m.item_name?.includes('캣휠') || m.name?.includes('캣휠') ||
      JSON.stringify(m).includes('캣휠')
    );
    console.log(`  전체 매핑: ${allMaps?.length}건, 캣휠 관련: ${catMaps?.length}건`);
    catMaps?.forEach(m => console.log('  ', JSON.stringify(m)));
    if (!catMaps?.length && allMaps?.length) {
      console.log('  매핑 샘플:', JSON.stringify(allMaps[0]));
    }
  }

  // ─── 3. forecast가 쿠팡 매핑에 사용하는 vendor_item_id 체크 ───
  console.log('\n━━━ 3. vendor_item_id 매핑 분석 ━━━');
  
  // products에 vendor_item_ids 필드가 있는지 확인
  const catProd = catProds?.[0];
  if (catProd) {
    console.log('  캣휠 product의 모든 필드:');
    Object.entries(catProd).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') console.log(`    ${k}: ${JSON.stringify(v)}`);
    });
  }

  // coupang_product_mappings 같은 테이블 확인
  const tables = ['coupang_product_mappings', 'vendor_item_mappings', 'coupang_mappings'];
  for (const t of tables) {
    const { data, error } = await sb.from(t).select('*').limit(1);
    if (!error) console.log(`  ${t} 존재, 샘플:`, JSON.stringify(data?.[0]));
  }

  // ─── 4. 판매자배송 캣휠 — vendor_item_id별 분석 ───
  console.log('\n━━━ 4. 판매자배송 캣휠 상세 (1/25~1/31) ━━━');
  const { data: sellerCat } = await sb.from('coupang_order_items')
    .select('vendor_item_id, vendor_item_name, shipping_count, seller_product_id, seller_product_name, seller_product_item_name, external_vendor_sku_code, coupang_orders!inner(ordered_at, status)')
    .ilike('vendor_item_name', '%캣휠%')
    .gte('coupang_orders.ordered_at', '2026-01-25T00:00:00')
    .lte('coupang_orders.ordered_at', '2026-02-01T00:00:00');

  // 본체 vs 부품 구분
  const sellerBody = sellerCat?.filter(s => !s.vendor_item_name?.includes('부품'));
  const sellerParts = sellerCat?.filter(s => s.vendor_item_name?.includes('부품'));

  console.log(`  전체: ${sellerCat?.length}건, 본체: ${sellerBody?.length}건, 부품: ${sellerParts?.length}건`);
  
  console.log('\n  [본체]');
  const sellerVids = new Map();
  sellerBody?.forEach(s => {
    const key = s.vendor_item_id;
    if (!sellerVids.has(key)) sellerVids.set(key, { name: s.vendor_item_name, count: 0, qty: 0, dates: [], status: [], spid: s.seller_product_id, sku: s.external_vendor_sku_code });
    const e = sellerVids.get(key);
    e.count++;
    e.qty += s.shipping_count || 1;
    e.dates.push(s.coupang_orders?.ordered_at?.substring(0,10));
    e.status.push(s.coupang_orders?.status);
  });
  
  for (const [vid, info] of sellerVids) {
    console.log(`  vendor_item_id: ${vid}`);
    console.log(`    상품명: ${info.name}`);
    console.log(`    seller_product_id: ${info.spid}`);
    console.log(`    external_sku: ${info.sku || '없음'}`);
    console.log(`    주문 ${info.count}건, 수량 ${info.qty}개`);
    console.log(`    날짜: ${info.dates.join(', ')}`);
    console.log(`    상태: ${[...new Set(info.status)].join(', ')}`);
  }

  // ─── 5. 로켓그로스 캣휠 — vendor_item_id별 분석 ───
  console.log('\n━━━ 5. 로켓그로스 캣휠 상세 (1/25~1/31) ━━━');
  const { data: rocketCat } = await sb.from('rocket_growth_order_items')
    .select('vendor_item_id, product_name, sales_quantity, rocket_growth_orders!inner(paid_at, vendor_id)')
    .ilike('product_name', '%캣휠%')
    .gte('rocket_growth_orders.paid_at', '2026-01-25T00:00:00')
    .lte('rocket_growth_orders.paid_at', '2026-02-01T00:00:00');

  const rocketBody = rocketCat?.filter(r => !r.product_name?.includes('부품'));
  const rocketParts = rocketCat?.filter(r => r.product_name?.includes('부품'));

  console.log(`  전체: ${rocketCat?.length}건, 본체: ${rocketBody?.length}건, 부품: ${rocketParts?.length}건`);

  console.log('\n  [본체]');
  const rocketVids = new Map();
  rocketBody?.forEach(r => {
    const key = `${r.vendor_item_id}_${r.rocket_growth_orders?.vendor_id}`;
    if (!rocketVids.has(key)) rocketVids.set(key, { vid: r.vendor_item_id, vendorId: r.rocket_growth_orders?.vendor_id, name: r.product_name, count: 0, qty: 0, dates: [] });
    const e = rocketVids.get(key);
    e.count++;
    e.qty += r.sales_quantity || 1;
    e.dates.push(r.rocket_growth_orders?.paid_at?.substring(0,10));
  });

  for (const [, info] of rocketVids) {
    console.log(`  vendor_item_id: ${info.vid} (vendor: ${info.vendorId})`);
    console.log(`    상품명: ${info.name}`);
    console.log(`    주문 ${info.count}건, 수량 ${info.qty}개`);
    const dateCount = {};
    info.dates.forEach(d => dateCount[d] = (dateCount[d]||0)+1);
    console.log(`    날짜별:`, Object.entries(dateCount).sort().map(([d,c]) => `${d}(${c})`).join(', '));
  }

  // ─── 6. 네이버 캣휠 (본체만) ───
  console.log('\n━━━ 6. 네이버 캣휠 (1/25~1/31) ━━━');
  const { data: naverCat } = await sb.from('naver_orders')
    .select('payment_date, quantity, product_name, product_id, option_name, channel_product_no')
    .ilike('product_name', '%캣휠%')
    .gte('payment_date', '2026-01-25T00:00:00')
    .lte('payment_date', '2026-02-01T00:00:00');

  const naverBody = naverCat?.filter(n => !n.product_name?.includes('부품'));
  const naverParts = naverCat?.filter(n => n.product_name?.includes('부품'));
  
  console.log(`  전체: ${naverCat?.length}건, 본체: ${naverBody?.length}건, 부품: ${naverParts?.length}건`);
  naverBody?.forEach(n => console.log(`  ${n.payment_date?.substring(0,10)} | ${n.quantity}개 | ${n.product_name} | pid:${n.product_id?.substring(0,8)} | 옵션:${n.option_name||'없음'}`));
  if (naverParts?.length) {
    console.log('  [부품 - 참고]');
    naverParts?.forEach(n => console.log(`  ${n.payment_date?.substring(0,10)} | ${n.quantity}개 | ${n.product_name}`));
  }

  // ─── 7. forecast API의 매핑 로직 추적 ───
  console.log('\n━━━ 7. forecast 매핑 추적 ━━━');
  
  // forecast는 vendor_item_id를 products 테이블과 어떻게 매핑하는가?
  // products 테이블의 vendor_item_ids 또는 coupang_vendor_item_ids 확인
  if (catProd) {
    // products의 모든 ID 관련 필드
    const idFields = Object.entries(catProd).filter(([k]) => 
      k.includes('id') || k.includes('sku') || k.includes('vendor') || k.includes('mapping') || k.includes('coupang')
    );
    console.log('  캣휠 product ID 관련 필드:');
    idFields.forEach(([k,v]) => { if(v) console.log(`    ${k}: ${v}`); });
  }

  // 판매자배송의 vendor_item_ids가 products에 매핑되는지
  console.log('\n  [판매자배송 vid → product 매핑 확인]');
  for (const [vid] of sellerVids) {
    const { data: mapped } = await sb.from('products')
      .select('id, name')
      .or(`sku.eq.${vid},barcode.eq.${vid}`);
    console.log(`    vid ${vid} → ${mapped?.length ? mapped.map(m => m.name).join(', ') : '❌ 매핑 없음'}`);
  }

  console.log('\n  [로켓그로스 vid → product 매핑 확인]');
  for (const [, info] of rocketVids) {
    const { data: mapped } = await sb.from('products')
      .select('id, name')
      .or(`sku.eq.${info.vid},barcode.eq.${info.vid}`);
    console.log(`    vid ${info.vid} → ${mapped?.length ? mapped.map(m => m.name).join(', ') : '❌ 매핑 없음'}`);
  }

  // ─── 8. forecast route의 실제 매핑 로직 ───
  console.log('\n━━━ 8. 전체 판매자배송 1/30~1/31 실태 ━━━');
  
  const { data: seller30 } = await sb.from('coupang_order_items')
    .select('shipping_count, vendor_item_name, coupang_orders!inner(ordered_at)')
    .gte('coupang_orders.ordered_at', '2026-01-30T00:00:00')
    .lte('coupang_orders.ordered_at', '2026-02-01T00:00:00');
  
  console.log(`  1/30~1/31 판매자배송 전체: ${seller30?.length}건`);
  seller30?.forEach(s => console.log(`  ${s.coupang_orders?.ordered_at?.substring(0,10)} | ${s.shipping_count}개 | ${s.vendor_item_name?.substring(0,40)}`));

  // ─── 9. 날짜별 전체 요약 (본체만) ───
  console.log('\n━━━ 9. 캣휠 본체 7일 판매 요약 ━━━');
  console.log('날짜    | 네이버 | 로켓GR | 판매자 | 합계');
  console.log('--------|--------|--------|--------|-----');
  for (let day = 25; day <= 31; day++) {
    const d = `2026-01-${String(day).padStart(2,'0')}`;
    const nv = naverBody?.filter(n => n.payment_date?.startsWith(d)).reduce((s,n) => s+(n.quantity||1), 0) || 0;
    const rk = rocketBody?.filter(r => r.rocket_growth_orders?.paid_at?.startsWith(d)).reduce((s,r) => s+(r.sales_quantity||1), 0) || 0;
    const sl = sellerBody?.filter(s => s.coupang_orders?.ordered_at?.startsWith(d)).reduce((s,i) => s+(i.shipping_count||1), 0) || 0;
    console.log(`${d} | ${String(nv).padStart(6)} | ${String(rk).padStart(6)} | ${String(sl).padStart(6)} | ${nv+rk+sl}`);
  }
  const totalN = naverBody?.reduce((s,n)=>s+(n.quantity||1),0)||0;
  const totalR = rocketBody?.reduce((s,r)=>s+(r.sales_quantity||1),0)||0;
  const totalS = sellerBody?.reduce((s,i)=>s+(i.shipping_count||1),0)||0;
  console.log(`합계    | ${String(totalN).padStart(6)} | ${String(totalR).padStart(6)} | ${String(totalS).padStart(6)} | ${totalN+totalR+totalS}`);
}

main().catch(e => { console.error(e); process.exit(1); });
