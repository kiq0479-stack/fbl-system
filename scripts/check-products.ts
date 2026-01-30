import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(import.meta.dirname || __dirname, '..', '.env.local') });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: products } = await sb.from('products').select('id, sku, name, category, is_active');
  console.log('=== products ===');
  products?.forEach(p => console.log(JSON.stringify(p)));

  const { data: mappings } = await sb.from('product_mappings').select('*').eq('is_active', true);
  console.log('\n=== active mappings ===');
  mappings?.forEach(m => console.log(JSON.stringify(m)));

  // products 스키마
  const { data: s } = await sb.from('products').select('*').limit(1);
  console.log('\n=== products columns ===', s?.[0] ? Object.keys(s[0]) : 'empty');

  const { data: ms } = await sb.from('product_mappings').select('*').limit(1);
  console.log('=== mappings columns ===', ms?.[0] ? Object.keys(ms[0]) : 'empty');
}
main();
