/**
 * Forecast 검증 — 매핑 후 상품별 판매량 최종 확인
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(import.meta.dirname || __dirname, '..', '.env.local') });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function fetchAll(table: string, select: string, filter?: any) {
  const all: any[] = [];
  let from = 0;
  while (true) {
    let q = sb.from(table).select(select).range(from, from + 999);
    if (filter) for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const { data } = await q;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function main() {
  // 1. 상품 + 매핑 로드
  const products = await fetchAll('products', 'id, sku, name, category', { is_active: true });
  const mappings = await fetchAll('product_mappings', 'product_id, external_option_id, marketplace', { is_active: true, marketplace: 'coupang' });

  // VID → product_id 맵
  const vidToProduct = new Map<string, string>();
  mappings.forEach((m: any) => {
    if (m.external_option_id) vidToProduct.set(m.external_option_id.toString(), m.product_id);
  });
  // SKU 매칭 추가
  products.forEach((p: any) => {
    if (!vidToProduct.has(p.sku)) vidToProduct.set(p.sku, p.id);
  });
  // prefix 매칭
  const skuPrefixMap = new Map<string, string>();
  products.forEach((p: any) => {
    if (p.sku?.length >= 9) skuPrefixMap.set(p.sku.substring(0, 9), p.id);
  });

  // 2. 전체 주문 아이템 로드
  const items = await fetchAll('coupang_order_items', 'vendor_item_id, shipping_count');

  // 3. 상품별 판매량 집계
  const salesByProduct = new Map<string, number>();
  let matched = 0, unmatched = 0, unmatchedQty = 0;

  items.forEach((item: any) => {
    const vid = item.vendor_item_id?.toString();
    let pid = vidToProduct.get(vid);
    if (!pid && vid?.length >= 9) pid = skuPrefixMap.get(vid.substring(0, 9));

    if (pid) {
      salesByProduct.set(pid, (salesByProduct.get(pid) || 0) + (item.shipping_count || 0));
      matched++;
    } else {
      unmatched++;
      unmatchedQty += item.shipping_count || 0;
    }
  });

  // 4. 결과 출력
  console.log('='.repeat(60));
  console.log('📊 최종 판매량 검증 (전체 기간 120일)');
  console.log('='.repeat(60));
  console.log(`\n아이템: 총 ${items.length}건 | 매칭 ${matched} | 미매칭 ${unmatched} (${unmatchedQty}개)\n`);

  const productMap = new Map(products.map((p: any) => [p.id, p]));

  // 판매량 높은 순 정렬
  const sorted = [...salesByProduct.entries()].sort((a, b) => b[1] - a[1]);

  for (const [pid, qty] of sorted) {
    const p = productMap.get(pid);
    console.log(`  ${qty.toString().padStart(6)}개  ${p?.name || 'unknown'}`);
  }

  // 판매량 0인 상품
  console.log(`\n  [판매 없음]`);
  products.forEach((p: any) => {
    if (!salesByProduct.has(p.id)) {
      console.log(`       0개  ${p.name}`);
    }
  });

  // 매출 검증
  const revenues = await fetchAll('coupang_revenues', 'items, sale_date');
  let revQty = 0, revAmt = 0;
  revenues.forEach((r: any) => {
    (r.items || []).forEach((i: any) => { revQty += i.quantity || 0; revAmt += i.settlementAmount || 0; });
  });
  console.log(`\n💰 매출: ${revenues.length}건, ${revQty}개, 정산 ₩${revAmt.toLocaleString()}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
