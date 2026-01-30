/**
 * 미매칭 vendorItemId → products + product_mappings 추가
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(import.meta.dirname || __dirname, '..', '.env.local') });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// 기존 products (id → sku 확인용)
const PRODUCT_MAP: Record<string, string> = {}; // sku → product_id

async function main() {
  // 1. 기존 products 로드
  const { data: products } = await sb.from('products').select('id, sku, name');
  products?.forEach(p => { PRODUCT_MAP[p.sku] = p.id; });

  // 2. 기존 coupang mappings 로드
  const { data: existingMappings } = await sb.from('product_mappings')
    .select('external_option_id').eq('marketplace', 'coupang').eq('is_active', true);
  const mappedVids = new Set((existingMappings || []).map(m => m.external_option_id));

  // 3. 미매칭 VID → 기존 product 매핑 (같은 상품, 다른 쿠팡 옵션)
  const newMappings: Array<{
    product_id: string;
    marketplace: string;
    external_product_name: string;
    external_option_id: string;
  }> = [];

  // 쉴트 호신용품 세트 - 4옵션 (쿠팡 로켓그로스 VID → 기존 product)
  const shiltMappings = [
    { vid: '90390096181', name: '쉴트 휴대용 호신용품 세트, 스카이&블루, 1개', sku: '90679900818' },
    { vid: '90390096199', name: '쉴트 휴대용 호신용품 세트, 화이트&그레이, 1개', sku: '90679900801' },
    { vid: '90390096211', name: '쉴트 휴대용 호신용품 세트, 핑크&퍼플, 1개', sku: '90679900811' },
    { vid: '90390096161', name: '쉴트 휴대용 호신용품 세트, 옐로우&골드, 1개', sku: '90679900792' },
  ];
  for (const m of shiltMappings) {
    if (mappedVids.has(m.vid)) continue;
    const pid = PRODUCT_MAP[m.sku];
    if (pid) newMappings.push({ product_id: pid, marketplace: 'coupang', external_product_name: m.name, external_option_id: m.vid });
    else console.log(`  ⚠️ SKU ${m.sku} 없음: ${m.name}`);
  }

  // 키들 3단 계단 디딤대 (로켓그로스 VID)
  const kidlStepMappings = [
    { vid: '92860759968', name: '키들 아기 3단 계단 디딤대, 1개, 화이트', sku: '92860846004' },
    { vid: '92860759996', name: '키들 아기 3단 계단 디딤대, 1개, 브라운', sku: '92860846013' },
  ];
  for (const m of kidlStepMappings) {
    if (mappedVids.has(m.vid)) continue;
    const pid = PRODUCT_MAP[m.sku];
    if (pid) newMappings.push({ product_id: pid, marketplace: 'coupang', external_product_name: m.name, external_option_id: m.vid });
  }

  // 키들 정리함 베이직+책장 4단 (로켓그로스 VID)
  const orgMappings = [
    { vid: '92314923063', name: '키들 장난감 정리함 인형 교구장, 베이직+책장 4단', sku: '92314923111' },
  ];
  for (const m of orgMappings) {
    if (mappedVids.has(m.vid)) continue;
    const pid = PRODUCT_MAP[m.sku];
    if (pid) newMappings.push({ product_id: pid, marketplace: 'coupang', external_product_name: m.name, external_option_id: m.vid });
  }

  // 메오메오 캣휠
  const catMappings = [
    { vid: '90747498533', name: '메오메오 저소음 거리측정 캣휠, 1개', sku: '90803836837' },
  ];
  for (const m of catMappings) {
    if (mappedVids.has(m.vid)) continue;
    const pid = PRODUCT_MAP[m.sku];
    if (pid) newMappings.push({ product_id: pid, marketplace: 'coupang', external_product_name: m.name, external_option_id: m.vid });
  }

  // 4. 새 products 생성 필요 (기존에 없는 상품)
  const newProducts = [
    { sku: '91381798047', name: '코지앤칠 겨울 방한 귀마개 귀도리 블랙', category: '쿠팡' },
    { sku: '91270753709', name: '코지앤칠 기능성 러닝 헤어밴드 귀마개 블랙', category: '쿠팡' },
    { sku: '90479844989', name: '쉴트 휴대용 곰돌이 호신용 경보기', category: '쿠팡' },
    { sku: '91271079730', name: '코지앤칠 겨울 방한 터치 장갑 L 블랙', category: '쿠팡' },
    { sku: '91271079737', name: '코지앤칠 겨울 방한 터치 장갑 L 네이비', category: '쿠팡' },
    { sku: '91271079767', name: '코지앤칠 겨울 방한 터치 장갑 M 블랙', category: '쿠팡' },
  ];

  console.log(`\n📝 새 products 추가: ${newProducts.length}건`);
  for (const p of newProducts) {
    if (PRODUCT_MAP[p.sku]) { console.log(`  ⏭️ ${p.name} (이미 있음)`); continue; }
    const { data, error } = await sb.from('products')
      .insert({ name: p.name, sku: p.sku, category: p.category, is_active: true })
      .select('id').single();
    if (error) { console.log(`  ❌ ${p.name}: ${error.message}`); continue; }
    console.log(`  ✅ ${p.name} (${data.id})`);
    PRODUCT_MAP[p.sku] = data.id;

    // 자동으로 coupang 매핑도 추가 (SKU = VID인 경우)
    newMappings.push({
      product_id: data.id, marketplace: 'coupang',
      external_product_name: p.name, external_option_id: p.sku,
    });
  }

  // 5. 매핑 일괄 추가
  console.log(`\n📝 새 coupang mappings 추가: ${newMappings.length}건`);
  for (const m of newMappings) {
    const { error } = await sb.from('product_mappings').insert({
      ...m, is_active: true,
    });
    if (error) console.log(`  ❌ ${m.external_option_id}: ${error.message}`);
    else console.log(`  ✅ VID ${m.external_option_id} → ${m.external_product_name}`);
  }

  // 6. 검증
  console.log(`\n🔍 검증...`);
  const { count: pc } = await sb.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true);
  const { count: mc } = await sb.from('product_mappings').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('marketplace', 'coupang');
  console.log(`  products: ${pc}건, coupang mappings: ${mc}건`);
}

main().catch(console.error);
