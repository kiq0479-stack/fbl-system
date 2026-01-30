import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(import.meta.dirname || __dirname, '..', '.env.local') });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // v1/v2에서 만든 중복 주문 + 아이템 정리
  // 먼저 전체 현황
  const { count: orderCount } = await sb.from('coupang_orders').select('*', { count: 'exact', head: true });
  const { count: itemCount } = await sb.from('coupang_order_items').select('*', { count: 'exact', head: true });
  console.log(`현재: 주문 ${orderCount}건, 아이템 ${itemCount}건`);

  // 아이템이 없는 주문(items insert 실패했던 것들) 확인
  // 일단은 중복 아이템 제거 — coupang_order_id + vendor_item_id 기준
  const { data: dupes } = await sb.rpc('get_duplicate_order_items_count');
  console.log('중복 체크 RPC:', dupes);

  // RPC 없으면 수동으로 확인
  const { data: allItems } = await sb.from('coupang_order_items').select('id, coupang_order_id, vendor_item_id').order('id');
  if (!allItems) { console.log('아이템 조회 실패'); return; }

  const seen = new Map<string, number>();
  const dupeIds: string[] = [];
  for (const item of allItems) {
    const key = `${item.coupang_order_id}_${item.vendor_item_id}`;
    if (seen.has(key)) {
      dupeIds.push(item.id);
    } else {
      seen.set(key, item.id);
    }
  }
  console.log(`중복 아이템: ${dupeIds.length}건`);

  if (dupeIds.length > 0) {
    // 50개씩 삭제
    for (let i = 0; i < dupeIds.length; i += 50) {
      const batch = dupeIds.slice(i, i + 50);
      const { error } = await sb.from('coupang_order_items').delete().in('id', batch);
      if (error) console.log(`삭제 에러: ${error.message}`);
    }
    console.log(`${dupeIds.length}건 중복 삭제 완료`);
  }

  const { count: afterCount } = await sb.from('coupang_order_items').select('*', { count: 'exact', head: true });
  console.log(`정리 후: 아이템 ${afterCount}건`);
}

main().catch(console.error);
