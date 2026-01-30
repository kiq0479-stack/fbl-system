import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(import.meta.dirname || __dirname, '..', '.env.local') });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function fetchAll(table: string, select: string) {
  const all: any[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data } = await sb.from(table).select(select).range(from, from + step - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

async function main() {
  const allOrders = await fetchAll('coupang_orders', 'id, orderer_name');
  const allItems = await fetchAll('coupang_order_items', 'coupang_order_id');
  
  const hasItems = new Set(allItems.map((i: any) => i.coupang_order_id));
  const missing = allOrders.filter((o: any) => !hasItems.has(o.id));

  console.log(`전체 주문: ${allOrders.length}, 아이템 있음: ${hasItems.size}, 아이템 없음: ${missing.length}`);
  console.log(`  RG: ${missing.filter((o: any) => o.orderer_name === '(로켓그로스)').length}, 일반: ${missing.filter((o: any) => o.orderer_name !== '(로켓그로스)').length}`);

  if (missing.length > 0) {
    console.log(`🗑️ ${missing.length}건 삭제...`);
    const ids = missing.map((o: any) => o.id);
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await sb.from('coupang_orders').delete().in('id', ids.slice(i, i + 100));
      if (error) console.log(`  ❌ ${error.message}`);
    }
  }

  const { count: oc } = await sb.from('coupang_orders').select('*', { count: 'exact', head: true });
  const { count: ic } = await sb.from('coupang_order_items').select('*', { count: 'exact', head: true });
  console.log(`정리 후: 주문 ${oc}, 아이템 ${ic}`);
}
main().catch(console.error);
