#!/usr/bin/env node
/**
 * 네이버 데이터 정리 스크립트
 * 작업 1: 코지앤칠 제거 (products, product_mappings, naver_orders)
 * 작업 2: 키들 미매핑 product_mappings 추가
 * 작업 4: naver_orders에 새 매핑 적용
 */

const SUPABASE_URL = 'https://curqrfxjsslsqimzoios.supabase.co';
const SUPABASE_KEY = 'sb_secret_feF3UVXZxu9Ow98nKf9M2Q_RkAfLMjU';
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function query(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, { headers: HEADERS, ...options });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json')) return res.json();
  return null;
}

async function queryCount(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: { ...HEADERS, 'Prefer': 'count=exact' },
    method: 'HEAD',
  });
  return parseInt(res.headers.get('content-range')?.split('/')[1] || '0');
}

// ============================================================================
// 작업 1: 코지앤칠 제거
// ============================================================================
async function task1_removeCozyAndChill() {
  console.log('\n=== 작업 1: 코지앤칠 제거 ===\n');

  // 1-1. products 테이블에서 코지앤칠 상품 조회
  const products = await query('products?name=ilike.*코지앤칠*&select=id,name,is_active');
  console.log(`코지앤칠 상품 ${products.length}개 발견:`);
  products.forEach(p => console.log(`  - ${p.name} (${p.id}) active=${p.is_active}`));

  if (products.length > 0) {
    const productIds = products.map(p => p.id);

    // 1-1a. 관련 inventory_logs 삭제 (inventory FK 통해)
    for (const pid of productIds) {
      const inventories = await query(`inventory?product_id=eq.${pid}&select=id`);
      for (const inv of inventories) {
        await query(`inventory_logs?inventory_id=eq.${inv.id}`, { method: 'DELETE' });
      }
      // inventory 삭제
      await query(`inventory?product_id=eq.${pid}`, { method: 'DELETE' });
    }
    console.log('관련 inventory_logs, inventory 삭제 완료');

    // 1-1b. 관련 sales, sales_daily 삭제
    for (const pid of productIds) {
      await query(`sales?product_id=eq.${pid}`, { method: 'DELETE' });
      await query(`sales_daily?product_id=eq.${pid}`, { method: 'DELETE' });
    }
    console.log('관련 sales, sales_daily 삭제 완료');

    // 1-1c. products soft delete (is_active = false)
    const updatedProducts = await query(
      `products?name=ilike.*코지앤칠*`,
      {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      }
    );
    console.log(`products ${updatedProducts.length}개 is_active=false 처리`);
  }

  // 1-2. product_mappings 비활성화
  const mappings = await query('product_mappings?select=id,external_product_name,is_active&external_product_name=ilike.*코지앤칠*');
  console.log(`\n코지앤칠 매핑 ${mappings.length}개 발견`);
  
  if (mappings.length > 0) {
    const updated = await query(
      'product_mappings?external_product_name=ilike.*코지앤칠*',
      {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      }
    );
    console.log(`product_mappings ${updated.length}개 is_active=false 처리`);
  }

  // 1-3. naver_orders에서 코지앤칠 삭제
  // Supabase REST API는 대량 삭제 시 URL 길이 제한이 있을 수 있으므로 배치 처리
  const cozyOrders = await query('naver_orders?product_name=ilike.*코지앤칠*&select=id');
  console.log(`\n코지앤칠 주문 ${cozyOrders.length}건 발견`);
  
  if (cozyOrders.length > 0) {
    await query('naver_orders?product_name=ilike.*코지앤칠*', { method: 'DELETE' });
    console.log(`naver_orders ${cozyOrders.length}건 삭제 완료`);
  }
}

// ============================================================================
// 작업 2: 키들 미매핑 product_mappings 추가
// ============================================================================
async function task2_addKidleMappings() {
  console.log('\n=== 작업 2: 키들 product_mappings 추가 ===\n');

  const newMappings = [
    {
      marketplace: 'naver',
      external_product_name: '키들 아기 전면 책장 책꽂이 어린이 주니어 아이 키즈 유아 정리함',
      external_option_name: null,
      product_id: '9864bef3-64c8-4981-8118-bbadeb6d9d1d',
      is_active: true,
    },
    {
      marketplace: 'naver',
      external_product_name: '키들 장난감 정리함 책장 선반 아기 유아 키즈 인형 교구장 레고 보관함 정리대 수납장 3단',
      external_option_name: '3단',
      product_id: '5df34f25-2a72-40bb-8fc3-c552b558ce86',
      is_active: true,
    },
    {
      marketplace: 'naver',
      external_product_name: '키들 장난감 정리함 책장 선반 아기 유아 키즈 인형 교구장 레고 보관함 정리대 수납장 3단',
      external_option_name: '3단+책장',
      product_id: '827a4a7b-d569-4793-ad0c-8db8988c07e7',
      is_active: true,
    },
    {
      marketplace: 'naver',
      external_product_name: '키들 장난감 정리함 책장 선반 아기 유아 키즈 인형 교구장 레고 보관함 정리대 수납장 3단',
      external_option_name: '4단',
      product_id: '35752ee9-a122-40b2-aedd-05774367b4da',
      is_active: true,
    },
    {
      marketplace: 'naver',
      external_product_name: '키들 장난감 정리함 책장 선반 아기 유아 키즈 인형 교구장 레고 보관함 정리대 수납장 3단',
      external_option_name: '4단+책장',
      product_id: '6bd5ed95-665d-44a2-9519-ac429d7bfc2b',
      is_active: true,
    },
  ];

  const result = await query('product_mappings', {
    method: 'POST',
    body: JSON.stringify(newMappings),
    headers: { ...HEADERS, 'Prefer': 'return=representation,resolution=merge-duplicates' },
  });

  console.log(`${result.length}개 매핑 추가 완료:`);
  result.forEach(m => console.log(`  - ${m.external_product_name} [${m.external_option_name || 'null'}] → ${m.product_id}`));
}

// ============================================================================
// 작업 4: naver_orders에 새 매핑 적용
// ============================================================================
async function task4_applyMappingsToOrders() {
  console.log('\n=== 작업 4: naver_orders에 매핑 적용 ===\n');

  // 1. 활성 네이버 매핑 로드
  const mappings = await query('product_mappings?marketplace=eq.naver&is_active=eq.true&select=product_id,external_product_name,external_option_name');
  
  const mappingMap = new Map();
  mappings.forEach(m => {
    if (m.external_product_name) {
      if (m.external_option_name) {
        mappingMap.set(`${m.external_product_name}|||${m.external_option_name}`, m.product_id);
      }
      mappingMap.set(m.external_product_name, m.product_id);
    }
  });
  console.log(`매핑 ${mappings.length}개 로드 (키 ${mappingMap.size}개)`);

  // 2. product_id가 null인 naver_orders 조회
  const unmapped = await query('naver_orders?product_id=is.null&select=id,product_name,product_option');
  console.log(`미매핑 주문 ${unmapped.length}건`);

  // 3. 매핑 적용
  let updated = 0;
  for (const order of unmapped) {
    let productId = null;
    
    // 상품명 + 옵션명으로 먼저 시도
    if (order.product_option) {
      const keyWithOption = `${order.product_name}|||${order.product_option}`;
      if (mappingMap.has(keyWithOption)) {
        productId = mappingMap.get(keyWithOption);
      }
    }
    // 상품명만으로 시도
    if (!productId && mappingMap.has(order.product_name)) {
      productId = mappingMap.get(order.product_name);
    }

    if (productId) {
      await query(`naver_orders?id=eq.${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ product_id: productId }),
      });
      updated++;
    }
  }

  console.log(`${updated}건 매핑 업데이트 완료 (${unmapped.length - updated}건 여전히 미매핑)`);
}

// ============================================================================
// 검증
// ============================================================================
async function verify() {
  console.log('\n=== 검증 ===\n');

  const totalOrders = await queryCount('naver_orders?select=*');
  const mappedOrders = await queryCount('naver_orders?product_id=not.is.null&select=*');
  const unmappedOrders = await queryCount('naver_orders?product_id=is.null&select=*');
  const cozyProducts = await query('products?name=ilike.*코지앤칠*&select=id,name,is_active');
  const activeCozy = cozyProducts.filter(p => p.is_active);

  console.log(`naver_orders: 전체 ${totalOrders}건, 매핑됨 ${mappedOrders}건, 미매핑 ${unmappedOrders}건`);
  console.log(`매핑률: ${totalOrders > 0 ? ((mappedOrders / totalOrders) * 100).toFixed(1) : 0}%`);
  console.log(`코지앤칠 상품: ${cozyProducts.length}개 (활성: ${activeCozy.length}개)`);
}

// ============================================================================
// 메인 실행
// ============================================================================
async function main() {
  console.log('🚀 네이버 데이터 정리 시작\n');
  
  await task1_removeCozyAndChill();
  await task2_addKidleMappings();
  await task4_applyMappingsToOrders();
  await verify();
  
  console.log('\n✅ 모든 작업 완료');
}

main().catch(err => {
  console.error('❌ 오류:', err);
  process.exit(1);
});
