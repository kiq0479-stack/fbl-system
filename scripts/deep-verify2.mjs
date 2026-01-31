#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
  console.log('══════════════════════════════════════════');
  console.log('  정밀 검증 2: 중복/오류 추적');
  console.log('══════════════════════════════════════════\n');

  // ─── 1. 판매자배송 vs 로켓그로스 중복 체크 ───
  console.log('━━━ 1. order_id 중복 체크 (판매자배송 vs 로켓그로스) ━━━');

  // coupang_orders의 order_ids
  const { data: cOrders } = await sb.from('coupang_orders')
    .select('order_id')
    .gte('ordered_at', '2026-01-25T00:00:00')
    .lte('ordered_at', '2026-02-01T00:00:00')
    .limit(5000);
  const cOrderIds = new Set(cOrders?.map(o => String(o.order_id)));

  // rocket_growth_orders의 order_ids
  const { data: rOrders } = await sb.from('rocket_growth_orders')
    .select('order_id')
    .gte('paid_at', '2026-01-25T00:00:00')
    .lte('paid_at', '2026-02-01T00:00:00')
    .limit(5000);
  const rOrderIds = new Set(rOrders?.map(o => String(o.order_id)));

  const overlap = [...cOrderIds].filter(id => rOrderIds.has(id));
  console.log(`  판매자배송 주문: ${cOrderIds.size}건`);
  console.log(`  로켓그로스 주문: ${rOrderIds.size}건`);
  console.log(`  중복 order_id: ${overlap.length}건`);
  if (overlap.length > 0) {
    console.log(`  ⚠️ 중복 order_ids: ${overlap.slice(0, 10).join(', ')}${overlap.length > 10 ? '...' : ''}`);
  }

  // ─── 2. 캣휠 판매자배송 주문의 실제 order 상세 ───
  console.log('\n━━━ 2. 캣휠 판매자배송 주문 상세 추적 ━━━');
  
  const { data: catSellerItems } = await sb.from('coupang_order_items')
    .select('coupang_order_id, vendor_item_id, vendor_item_name, shipping_count')
    .ilike('vendor_item_name', '%캣휠%')
    .limit(100);
  
  const catOrderIds = [...new Set(catSellerItems?.map(i => i.coupang_order_id))];
  
  for (const orderId of catOrderIds.slice(0, 5)) {
    const { data: order } = await sb.from('coupang_orders')
      .select('*')
      .eq('id', orderId)
      .single();
    
    if (order) {
      console.log(`\n  Order DB id: ${order.id}`);
      console.log(`    order_id: ${order.order_id}`);
      console.log(`    shipment_box_id: ${order.shipment_box_id}`);
      console.log(`    ordered_at: ${order.ordered_at}`);
      console.log(`    status: ${order.status}`);
      console.log(`    orderer: ${order.orderer_name}`);
      console.log(`    receiver: ${order.receiver_name}`);
      console.log(`    synced_at: ${order.synced_at}`);

      // 이 order_id가 로켓그로스에도 있는지?
      const isAlsoRocket = rOrderIds.has(String(order.order_id));
      console.log(`    로켓그로스 중복?: ${isAlsoRocket ? '⚠️ YES' : 'No'}`);
    }
  }

  // ─── 3. 캣휠의 vendor_item_id가 실제 쿠팡에서 어떤 채널인지 ───
  console.log('\n━━━ 3. vendor_item_id 채널 분석 ━━━');
  console.log('  캣휠 product sku: 90803836837');
  console.log('  product_mapping coupang external_option_id: 90747498533');
  console.log('  판매자배송 vid: 90803836837 (product.sku와 일치)');
  console.log('  로켓그로스 vid: 90803836837 + 91126488285');
  console.log('');
  console.log('  ⚠️ product_mapping의 external_option_id(90747498533)와');
  console.log('     실제 주문의 vendor_item_id(90803836837)가 다름!');

  // ─── 4. forecast route의 매핑 로직 확인 ───
  console.log('\n━━━ 4. forecast 매핑 방식 분석 ━━━');
  
  // product_mappings에서 coupang 매핑된 것들
  const { data: coupangMaps } = await sb.from('product_mappings')
    .select('product_id, external_option_id, external_product_name')
    .eq('marketplace', 'coupang');
  
  console.log(`  쿠팡 product_mappings: ${coupangMaps?.length}건`);
  coupangMaps?.forEach(m => console.log(`    pid:${m.product_id?.substring(0,8)} | ext_option:${m.external_option_id} | ${m.external_product_name?.substring(0,30)}`));

  // ─── 5. 전체 판매자배송 데이터 진단 (날짜별 + 실제 수량) ───
  console.log('\n━━━ 5. 판매자배송 전체 날짜별 상세 ━━━');
  
  for (let day = 25; day <= 31; day++) {
    const d = `2026-01-${String(day).padStart(2,'0')}`;
    const { data: dayItems } = await sb.from('coupang_order_items')
      .select('shipping_count, vendor_item_name, coupang_orders!inner(ordered_at, synced_at)')
      .gte('coupang_orders.ordered_at', `${d}T00:00:00`)
      .lt('coupang_orders.ordered_at', `${d}T23:59:59`)
      .limit(200);
    
    const qty = dayItems?.reduce((s,i) => s+(i.shipping_count||1), 0) || 0;
    const syncDates = [...new Set(dayItems?.map(i => i.coupang_orders?.synced_at?.substring(0,10)))];
    console.log(`  ${d}: ${dayItems?.length || 0}건 (${qty}개) | synced: ${syncDates.join(', ') || '없음'}`);
  }

  // ─── 6. 네이버 캣휠 재검증 ───
  console.log('\n━━━ 6. 네이버 캣휠 재검증 ━━━');
  const { data: allNaver } = await sb.from('naver_orders')
    .select('payment_date, quantity, product_name, product_id')
    .gte('payment_date', '2026-01-25T00:00:00')
    .lte('payment_date', '2026-02-01T00:00:00')
    .limit(500);
  
  const naverCat = allNaver?.filter(n => n.product_name?.includes('캣휠'));
  const naverCatBody = naverCat?.filter(n => !n.product_name?.includes('부품'));
  const naverCatParts = naverCat?.filter(n => n.product_name?.includes('부품'));
  
  console.log(`  네이버 캣휠 전체: ${naverCat?.length}건`);
  console.log('  [본체]');
  naverCatBody?.forEach(n => console.log(`    ${n.payment_date?.substring(0,10)} | ${n.quantity}개 | ${n.product_name}`));
  console.log('  [부품]');
  naverCatParts?.forEach(n => console.log(`    ${n.payment_date?.substring(0,10)} | ${n.quantity}개 | ${n.product_name}`));

  // ─── 7. forecast가 보는 최종 결과 시뮬레이션 ───
  console.log('\n━━━ 7. forecast 7일 계산 시뮬레이션 ━━━');
  
  // forecast now = getKSTDate(1) = yesterday = 2026-01-31
  // daysAgo < 7 = 1/25~1/31
  
  // forecast uses:
  // - naver_orders: payment_date로 필터, product_id로 매핑
  // - coupang_order_items: ordered_at으로 필터, vendor_item_id→product 매핑 (product_mappings or sku)
  // - rocket_growth_order_items: paid_at으로 필터, vendor_item_id→product 매핑

  const catProductId = 'ef89aa1d-e9b8-48bb-be59-8873d20c6975';
  
  // naver: product_id로 직접 매핑
  const { data: nvForecast } = await sb.from('naver_orders')
    .select('quantity')
    .eq('product_id', catProductId)
    .gte('payment_date', '2026-01-25T00:00:00')
    .lte('payment_date', '2026-02-01T00:00:00');
  const nvTotal = nvForecast?.reduce((s,n) => s+(n.quantity||1), 0) || 0;

  console.log(`  네이버 (product_id 매핑): ${nvForecast?.length}건, ${nvTotal}개`);
  console.log(`    ⚠️ product_id 매핑이라 부품도 포함될 수 있음 (naver_orders에서 product_id가 캣휠에 매핑된 모든 주문)`);

  // products.sku로 매핑되는 coupang 주문
  console.log(`\n  products.sku (90803836837)로 coupang_order_items 매핑 확인:`);
  console.log(`    판매자배송: vid=90803836837 → 10건 (하지만 주인님은 0건이라고 함)`);
  console.log(`    로켓그로스: vid=90803836837 → 16건, vid=91126488285 → 1건 (매핑 안됨)`);
}

main().catch(e => { console.error(e); process.exit(1); });
