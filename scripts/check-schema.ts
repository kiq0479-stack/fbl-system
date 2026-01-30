import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(import.meta.dirname || __dirname, '..', '.env.local') });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // coupang_order_items 샘플 (기존 데이터)
  const { data } = await sb.from('coupang_order_items').select('*').limit(1);
  console.log('coupang_order_items columns:', data?.[0] ? Object.keys(data[0]) : 'empty');
  console.log('sample:', JSON.stringify(data?.[0], null, 2));
}
main();
