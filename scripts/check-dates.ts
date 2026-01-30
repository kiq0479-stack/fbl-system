import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(import.meta.dirname || __dirname, '..', '.env.local') });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // 최근 7일 주문 확인
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const { data: recentOrders, count } = await sb.from('coupang_orders')
    .select('ordered_at, status, orderer_name', { count: 'exact' })
    .gte('ordered_at', sevenDaysAgo.toISOString())
    .order('ordered_at', { ascending: false })
    .limit(10);

  console.log(`=== 최근 7일 주문: ${count}건 ===`);
  recentOrders?.forEach(o => console.log(`  ${o.ordered_at} | ${o.status} | ${o.orderer_name}`));

  // 최근 30일
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { count: c30 } = await sb.from('coupang_orders')
    .select('*', { count: 'exact', head: true })
    .gte('ordered_at', thirtyDaysAgo.toISOString());
  console.log(`\n최근 30일 주문: ${c30}건`);

  // 날짜 분포 (월별)
  const { data: allOrders } = await sb.from('coupang_orders')
    .select('ordered_at')
    .order('ordered_at', { ascending: true });

  const monthCount: Record<string, number> = {};
  allOrders?.forEach(o => {
    const month = o.ordered_at?.substring(0, 7) || 'null';
    monthCount[month] = (monthCount[month] || 0) + 1;
  });
  console.log('\n=== 월별 주문 분포 ===');
  Object.entries(monthCount).sort().forEach(([m, c]) => console.log(`  ${m}: ${c}건`));

  // ordered_at이 null이거나 이상한 값?
  const { count: nullCount } = await sb.from('coupang_orders')
    .select('*', { count: 'exact', head: true })
    .is('ordered_at', null);
  console.log(`\nordered_at NULL: ${nullCount}건`);

  // 최신 주문 10건
  console.log('\n=== 최신 주문 10건 ===');
  const { data: latest } = await sb.from('coupang_orders')
    .select('order_id, ordered_at, status, orderer_name')
    .order('ordered_at', { ascending: false })
    .limit(10);
  latest?.forEach(o => console.log(`  ${o.ordered_at} | ${o.status} | ${o.orderer_name} | #${o.order_id}`));

  // 최근 7일 아이템 (forecast가 보는 방식)
  const { data: recentItems, count: itemCount } = await sb.from('coupang_order_items')
    .select('vendor_item_id, shipping_count, coupang_orders!inner(ordered_at)', { count: 'exact' })
    .gte('coupang_orders.ordered_at', sevenDaysAgo.toISOString())
    .limit(10);
  console.log(`\n=== 최근 7일 아이템 (inner join): ${itemCount}건 ===`);
  recentItems?.forEach(i => console.log(`  VID ${i.vendor_item_id} x${i.shipping_count} | ${(i as any).coupang_orders?.ordered_at}`));
}
main();
