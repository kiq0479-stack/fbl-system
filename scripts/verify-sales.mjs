#!/usr/bin/env node
/**
 * 판매 데이터 검증 스크립트
 * DB 데이터 vs 쿠팡 API 직접 조회 비교
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { HttpsProxyAgent } from 'https-proxy-agent';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const PROXY_URL = process.env.PROXY_URL;

// ─── Coupang API helper ───
function getAuth(method, basePath, query, accessKey, secretKey) {
  const dt = new Date().toISOString().substr(2,17).replace(/[-:]/g,'')+'Z';
  const sig = crypto.createHmac('sha256', secretKey).update(dt+method+basePath+query).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${dt}, signature=${sig}`;
}

async function coupangGet(fullPath, config) {
  const [bp, q] = fullPath.includes('?') ? fullPath.split('?') : [fullPath, ''];
  const auth = getAuth('GET', bp, q, config.accessKey, config.secretKey);
  const agent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : undefined;
  const res = await fetch(`https://api-gateway.coupang.com${fullPath}`, {
    headers: { 'Content-Type': 'application/json;charset=UTF-8', Authorization: auth }, agent
  });
  return res.json();
}

function accounts() {
  const accs = [];
  if (process.env.COUPANG_VENDOR_ID) accs.push({ name: '컴팩트우디', vendorId: process.env.COUPANG_VENDOR_ID, accessKey: process.env.COUPANG_ACCESS_KEY, secretKey: process.env.COUPANG_SECRET_KEY });
  if (process.env.COUPANG_VENDOR_ID_2) accs.push({ name: '쉴트', vendorId: process.env.COUPANG_VENDOR_ID_2, accessKey: process.env.COUPANG_ACCESS_KEY_2, secretKey: process.env.COUPANG_SECRET_KEY_2 });
  return accs;
}

// ─── Main ───
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  FBL 판매 데이터 검증 (1/25 ~ 1/31)');
  console.log('═══════════════════════════════════════════\n');

  // ─────────────────────────────────────────
  // 1. 캣휠 검증
  // ─────────────────────────────────────────
  console.log('━━━ 검증 1: 캣휠 판매 데이터 ━━━');
  
  // products에서 캣휠 찾기
  const { data: catProducts } = await sb.from('products')
    .select('id, name, sku')
    .or('name.ilike.%캣휠%,name.ilike.%cat%wheel%');
  
  console.log('캣휠 상품:', catProducts?.map(p => `${p.name} (id: ${p.id})`).join(', ') || '없음');

  if (catProducts?.length) {
    for (const prod of catProducts) {
      // naver_orders에서 캣휠
      const { data: naverCat } = await sb.from('naver_orders')
        .select('payment_date, quantity, product_name')
        .eq('product_id', prod.id)
        .gte('payment_date', '2026-01-25T00:00:00')
        .lte('payment_date', '2026-02-01T00:00:00');
      console.log(`  네이버 (${prod.name}):`, naverCat?.length || 0, '건');
      naverCat?.forEach(n => console.log(`    ${n.payment_date?.split('T')[0]} | ${n.quantity}개 | ${n.product_name}`));

      // rocket_growth_order_items에서 캣휠
      const { data: rocketItems } = await sb.from('rocket_growth_order_items')
        .select('sales_quantity, product_name, rocket_growth_orders!inner(paid_at)')
        .or(`product_name.ilike.%캣휠%,vendor_item_id.eq.${prod.sku || 'none'}`)
        .gte('rocket_growth_orders.paid_at', '2026-01-25T00:00:00')
        .lte('rocket_growth_orders.paid_at', '2026-02-01T00:00:00');
      console.log(`  로켓그로스 (캣휠):`, rocketItems?.length || 0, '건');
      rocketItems?.forEach(r => console.log(`    ${r.rocket_growth_orders?.paid_at?.split('T')[0]} | ${r.sales_quantity}개 | ${r.product_name}`));

      // coupang_order_items에서 캣휠
      const { data: sellerItems } = await sb.from('coupang_order_items')
        .select('shipping_count, vendor_item_name, coupang_orders!inner(ordered_at)')
        .or(`vendor_item_name.ilike.%캣휠%,vendor_item_id.eq.${prod.sku || 'none'}`)
        .gte('coupang_orders.ordered_at', '2026-01-25T00:00:00')
        .lte('coupang_orders.ordered_at', '2026-02-01T00:00:00');
      console.log(`  판매자배송 (캣휠):`, sellerItems?.length || 0, '건');
      sellerItems?.forEach(s => console.log(`    ${s.coupang_orders?.ordered_at?.split('T')[0]} | ${s.shipping_count}개 | ${s.vendor_item_name}`));
    }
  }

  // 캣휠 직접 검색 (product 매핑 안 된 경우)
  console.log('\n  [product 매핑 무관 직접 검색]');
  const { data: rocketCatAll } = await sb.from('rocket_growth_order_items')
    .select('sales_quantity, product_name, rocket_growth_orders!inner(paid_at)')
    .ilike('product_name', '%캣휠%')
    .gte('rocket_growth_orders.paid_at', '2026-01-25T00:00:00')
    .lte('rocket_growth_orders.paid_at', '2026-02-01T00:00:00');
  console.log('  로켓그로스 캣휠 직접검색:', rocketCatAll?.length || 0, '건');
  rocketCatAll?.forEach(r => console.log(`    ${r.rocket_growth_orders?.paid_at?.split('T')[0]} | ${r.sales_quantity}개 | ${r.product_name}`));

  const { data: sellerCatAll } = await sb.from('coupang_order_items')
    .select('shipping_count, vendor_item_name, coupang_orders!inner(ordered_at)')
    .ilike('vendor_item_name', '%캣휠%')
    .gte('coupang_orders.ordered_at', '2026-01-25T00:00:00')
    .lte('coupang_orders.ordered_at', '2026-02-01T00:00:00');
  console.log('  판매자배송 캣휠 직접검색:', sellerCatAll?.length || 0, '건');
  sellerCatAll?.forEach(s => console.log(`    ${s.coupang_orders?.ordered_at?.split('T')[0]} | ${s.shipping_count}개 | ${s.vendor_item_name}`));

  const { data: naverCatAll } = await sb.from('naver_orders')
    .select('payment_date, quantity, product_name')
    .ilike('product_name', '%캣휠%')
    .gte('payment_date', '2026-01-25T00:00:00')
    .lte('payment_date', '2026-02-01T00:00:00');
  console.log('  네이버 캣휠 직접검색:', naverCatAll?.length || 0, '건');
  naverCatAll?.forEach(n => console.log(`    ${n.payment_date?.split('T')[0]} | ${n.quantity}개 | ${n.product_name}`));

  // ─────────────────────────────────────────
  // 2. DB vs API 크로스체크 (로켓그로스)
  // ─────────────────────────────────────────
  console.log('\n━━━ 검증 2: 로켓그로스 DB vs API 비교 (1/25~1/31) ━━━');
  
  const { data: dbRocket } = await sb.from('rocket_growth_order_items')
    .select('sales_quantity, rocket_growth_orders!inner(paid_at)')
    .gte('rocket_growth_orders.paid_at', '2026-01-25T00:00:00')
    .lte('rocket_growth_orders.paid_at', '2026-02-01T00:00:00')
    .limit(5000);
  
  const dbRocketByDate = {};
  dbRocket?.forEach(r => {
    const d = r.rocket_growth_orders?.paid_at?.split('T')[0];
    dbRocketByDate[d] = (dbRocketByDate[d] || 0) + (r.sales_quantity || 1);
  });

  // API 직접 조회
  let apiRocketByDate = {};
  for (const acc of accounts()) {
    const resp = await coupangGet(
      `/v2/providers/rg_open_api/apis/api/v1/vendors/${acc.vendorId}/rg/orders?paidDateFrom=20260125&paidDateTo=20260201`,
      acc
    );
    (resp.data || []).forEach(order => {
      const ts = typeof order.paidAt === 'number' ? order.paidAt : new Date(order.paidAt).getTime();
      const d = new Date(ts + 9*3600*1000).toISOString().split('T')[0];
      const qty = (order.orderItems || []).reduce((sum, i) => sum + (i.salesQuantity || 1), 0);
      apiRocketByDate[d] = (apiRocketByDate[d] || 0) + qty;
    });
  }

  console.log('날짜       | DB수량 | API수량 | 일치?');
  console.log('-----------|--------|---------|------');
  for (let day = 25; day <= 31; day++) {
    const d = `2026-01-${String(day).padStart(2,'0')}`;
    const db = dbRocketByDate[d] || 0;
    const api = apiRocketByDate[d] || 0;
    console.log(`${d} | ${String(db).padStart(6)} | ${String(api).padStart(7)} | ${db === api ? '✅' : '❌ 차이 ' + (api - db)}`);
  }

  // ─────────────────────────────────────────
  // 3. 판매자배송 DB vs API 비교
  // ─────────────────────────────────────────
  console.log('\n━━━ 검증 3: 판매자배송 DB vs API 비교 (1/25~1/31) ━━━');
  
  const { data: dbSeller } = await sb.from('coupang_order_items')
    .select('shipping_count, coupang_orders!inner(ordered_at)')
    .gte('coupang_orders.ordered_at', '2026-01-25T00:00:00')
    .lte('coupang_orders.ordered_at', '2026-02-01T00:00:00')
    .limit(5000);

  const dbSellerByDate = {};
  dbSeller?.forEach(i => {
    const d = i.coupang_orders?.ordered_at?.split('T')[0];
    dbSellerByDate[d] = (dbSellerByDate[d] || 0) + (i.shipping_count || 1);
  });

  let apiSellerByDate = {};
  for (const acc of accounts()) {
    for (const status of ['ACCEPT','INSTRUCT','DEPARTURE','DELIVERING','FINAL_DELIVERY']) {
      try {
        const resp = await coupangGet(
          `/v2/providers/openapi/apis/api/v4/vendors/${acc.vendorId}/ordersheets?createdAtFrom=2026-01-25&createdAtTo=2026-01-31&status=${status}&maxPerPage=50`,
          acc
        );
        (resp.data || []).forEach(order => {
          const d = order.orderedAt?.split('T')[0];
          const qty = (order.orderItems || []).reduce((sum, i) => sum + (i.shippingCount || 1), 0);
          // 중복 방지: shipmentBoxId 기준
          apiSellerByDate[d] = (apiSellerByDate[d] || 0) + qty;
        });
      } catch (e) {
        console.log(`  [WARN] ${acc.name} ${status}: ${e.message}`);
      }
    }
  }

  console.log('날짜       | DB수량 | API수량 | 일치?');
  console.log('-----------|--------|---------|------');
  for (let day = 25; day <= 31; day++) {
    const d = `2026-01-${String(day).padStart(2,'0')}`;
    const db = dbSellerByDate[d] || 0;
    const api = apiSellerByDate[d] || 0;
    console.log(`${d} | ${String(db).padStart(6)} | ${String(api).padStart(7)} | ${db === api ? '✅' : '❌ 차이 ' + (api - db)}`);
  }

  // ─────────────────────────────────────────
  // 4. 네이버 날짜별
  // ─────────────────────────────────────────
  console.log('\n━━━ 검증 4: 네이버 주문 날짜별 ━━━');
  const { data: naverAll } = await sb.from('naver_orders')
    .select('payment_date, quantity')
    .gte('payment_date', '2026-01-25T00:00:00')
    .lte('payment_date', '2026-02-01T00:00:00')
    .limit(5000);
  
  const naverByDate = {};
  naverAll?.forEach(n => {
    const d = n.payment_date?.split('T')[0];
    naverByDate[d] = (naverByDate[d] || 0) + (n.quantity || 1);
  });
  
  console.log('날짜       | DB건수 | DB수량');
  console.log('-----------|--------|-------');
  for (let day = 25; day <= 31; day++) {
    const d = `2026-01-${String(day).padStart(2,'0')}`;
    console.log(`${d} | ${String(naverByDate[d] || 0).padStart(6)}`);
  }

  // ─────────────────────────────────────────
  // 5. forecast API가 보는 7일 판매량 (통합)
  // ─────────────────────────────────────────
  console.log('\n━━━ 검증 5: 전체 7일 판매량 요약 ━━━');
  console.log('날짜       | 네이버 | 로켓GR | 판매자 | 합계');
  console.log('-----------|--------|--------|--------|-----');
  let total = { naver: 0, rocket: 0, seller: 0 };
  for (let day = 25; day <= 31; day++) {
    const d = `2026-01-${String(day).padStart(2,'0')}`;
    const n = naverByDate[d] || 0;
    const r = dbRocketByDate[d] || 0;
    const s = dbSellerByDate[d] || 0;
    total.naver += n; total.rocket += r; total.seller += s;
    console.log(`${d} | ${String(n).padStart(6)} | ${String(r).padStart(6)} | ${String(s).padStart(6)} | ${n+r+s}`);
  }
  console.log(`합계       | ${String(total.naver).padStart(6)} | ${String(total.rocket).padStart(6)} | ${String(total.seller).padStart(6)} | ${total.naver+total.rocket+total.seller}`);
}

main().catch(e => { console.error(e); process.exit(1); });
