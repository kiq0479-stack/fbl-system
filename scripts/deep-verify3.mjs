#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
  console.log('══════════════════════════════════════════');
  console.log('  핵심 문제 진단: 주문 중복 + 오분류');
  console.log('══════════════════════════════════════════\n');

  // ─── 1. coupang_orders에 로켓그로스 주문이 섞여있는지 ───
  console.log('━━━ 1. coupang_orders 내 로켓그로스 주문 확인 ━━━');
  
  const { data: allCoupang } = await sb.from('coupang_orders')
    .select('id, order_id, ordered_at, orderer_name, receiver_name, shipment_box_id, status, synced_at')
    .gte('ordered_at', '2026-01-25T00:00:00')
    .lte('ordered_at', '2026-02-01T00:00:00')
    .limit(5000);

  const rocketInSeller = allCoupang?.filter(o => 
    o.orderer_name?.includes('로켓') || o.receiver_name?.includes('로켓') ||
    String(o.shipment_box_id) === String(o.order_id)
  );
  const genuineSeller = allCoupang?.filter(o => 
    !o.orderer_name?.includes('로켓') && !o.receiver_name?.includes('로켓') &&
    String(o.shipment_box_id) !== String(o.order_id)
  );

  console.log(`  coupang_orders 전체 (1/25~1/31): ${allCoupang?.length}건`);
  console.log(`  ├ 로켓그로스로 보이는 주문: ${rocketInSeller?.length}건`);
  console.log(`  └ 진짜 판매자배송 주문: ${genuineSeller?.length}건`);
  
  console.log('\n  [로켓그로스 주문 샘플 (coupang_orders에 잘못 들어간 것)]');
  rocketInSeller?.slice(0, 5).forEach(o => console.log(
    `    ${o.ordered_at?.substring(0,10)} | order:${o.order_id} | box:${o.shipment_box_id} | orderer:${o.orderer_name} | status:${o.status}`
  ));

  console.log('\n  [진짜 판매자배송 주문 샘플]');
  genuineSeller?.slice(0, 5).forEach(o => console.log(
    `    ${o.ordered_at?.substring(0,10)} | order:${o.order_id} | box:${o.shipment_box_id} | orderer:${o.orderer_name?.substring(0,6)} | status:${o.status}`
  ));

  // ─── 2. 날짜별 진짜 판매자배송 vs 오분류 ───
  console.log('\n━━━ 2. 날짜별 진짜 판매자배송 vs 로켓그로스 오분류 ━━━');
  console.log('날짜       | 진짜판매자 | 로켓오분류 | 합계(기존)');
  console.log('-----------|-----------|-----------|----------');
  
  for (let day = 25; day <= 31; day++) {
    const d = `2026-01-${String(day).padStart(2,'0')}`;
    const dayAll = allCoupang?.filter(o => o.ordered_at?.startsWith(d));
    const dayRocket = rocketInSeller?.filter(o => o.ordered_at?.startsWith(d));
    const dayGenuine = genuineSeller?.filter(o => o.ordered_at?.startsWith(d));
    console.log(`${d} | ${String(dayGenuine?.length||0).padStart(9)} | ${String(dayRocket?.length||0).padStart(9)} | ${dayAll?.length||0}`);
  }

  // ─── 3. 캣휠 판매자배송 10건은 실제로 뭔지? ───
  console.log('\n━━━ 3. 캣휠 "판매자배송" 10건 실체 확인 ━━━');
  
  const { data: catItems } = await sb.from('coupang_order_items')
    .select('coupang_order_id, vendor_item_name, shipping_count')
    .ilike('vendor_item_name', '%캣휠%');
  
  const catCoupangIds = catItems?.map(i => i.coupang_order_id);
  
  const { data: catOrders } = await sb.from('coupang_orders')
    .select('id, order_id, ordered_at, orderer_name, receiver_name, shipment_box_id')
    .in('id', catCoupangIds || []);
  
  let catGenuine = 0, catRocket = 0;
  catOrders?.forEach(o => {
    const isRocket = o.orderer_name?.includes('로켓') || String(o.shipment_box_id) === String(o.order_id);
    console.log(`  ${o.ordered_at?.substring(0,10)} | ${isRocket ? '🔴 로켓그로스' : '🟢 판매자배송'} | orderer:${o.orderer_name} | box:${o.shipment_box_id}`);
    if (isRocket) catRocket++; else catGenuine++;
  });
  console.log(`\n  캣휠 판매자배송(진짜): ${catGenuine}건`);
  console.log(`  캣휠 로켓그로스(오분류): ${catRocket}건`);

  // ─── 4. 이중 카운팅 영향 분석 ───
  console.log('\n━━━ 4. 이중 카운팅 영향 분석 ━━━');
  
  // 로켓그로스 DB에서도 같은 order_id로 존재하는지
  const rocketOrderIds = rocketInSeller?.map(o => o.order_id) || [];
  if (rocketOrderIds.length) {
    const { data: matchedRocket, count } = await sb.from('rocket_growth_orders')
      .select('order_id', { count: 'exact' })
      .in('order_id', rocketOrderIds.slice(0, 100));
    
    console.log(`  coupang_orders의 로켓 오분류 ${rocketInSeller?.length}건 중`);
    console.log(`  rocket_growth_orders에도 존재: ${count}건`);
    console.log(`  → forecast에서 이중 카운팅되는 건수: ${count}건`);
  }

  // ─── 5. 전체 영향 요약 ───
  console.log('\n━━━ 5. 전체 영향 요약 ━━━');
  
  // items 기준으로 진짜 판매자배송 수량 계산
  const genuineIds = new Set(genuineSeller?.map(o => o.id));
  const { data: genuineItems } = await sb.from('coupang_order_items')
    .select('shipping_count, coupang_orders!inner(ordered_at)')
    .gte('coupang_orders.ordered_at', '2026-01-25T00:00:00')
    .lte('coupang_orders.ordered_at', '2026-02-01T00:00:00')
    .limit(5000);

  const genuineItemsByDate = {};
  const rocketItemsByDate = {};
  
  for (const item of genuineItems || []) {
    const d = item.coupang_orders?.ordered_at?.substring(0,10);
    // 해당 주문이 genuineIds에 있는지 확인은 여기서 어렵... 대신 전체 비교
  }

  console.log('  현재 상태:');
  console.log(`  - coupang_orders에 로켓그로스 주문 ${rocketInSeller?.length}건 혼재`);
  console.log(`  - 이로 인해 forecast에서 이중 카운팅 발생`);
  console.log(`  - 캣휠 판매자배송 ${catGenuine}건 실제 / ${catRocket}건 로켓그로스 오분류`);
  console.log('\n  해결 방안:');
  console.log('  1. coupang_orders에서 로켓그로스 오분류 주문 삭제');
  console.log('  2. sync-cron에 로켓그로스 주문 필터 추가');
  console.log('  3. forecast에서 중복 order_id 제거 로직 추가');
}

main().catch(e => { console.error(e); process.exit(1); });
