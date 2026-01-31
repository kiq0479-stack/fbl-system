#!/usr/bin/env node
/**
 * 로켓그로스 주문 백필 스크립트
 * 로컬에서 실행 (Vercel 타임아웃 무관)
 * 
 * Usage: node scripts/rocket-backfill.mjs [from] [to]
 * Example: node scripts/rocket-backfill.mjs 2026-01-28 2026-02-01
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ─── Config ───
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROXY_URL = process.env.PROXY_URL;
const COUPANG_API_URL = 'https://api-gateway.coupang.com';

const accounts = [];
if (process.env.COUPANG_VENDOR_ID) {
  accounts.push({
    name: '컴팩트우디',
    vendorId: process.env.COUPANG_VENDOR_ID,
    accessKey: process.env.COUPANG_ACCESS_KEY,
    secretKey: process.env.COUPANG_SECRET_KEY,
  });
}
if (process.env.COUPANG_VENDOR_ID_2) {
  accounts.push({
    name: '쉴트',
    vendorId: process.env.COUPANG_VENDOR_ID_2,
    accessKey: process.env.COUPANG_ACCESS_KEY_2,
    secretKey: process.env.COUPANG_SECRET_KEY_2,
  });
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Coupang Auth ───
function getAuthHeader(method, path, query, accessKey, secretKey) {
  const datetime = new Date().toISOString().substr(2, 17).replace(/[-:]/g, '') + 'Z';
  const message = datetime + method + path + query;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

async function coupangFetch(method, fullPath, config) {
  const [basePath, query] = fullPath.includes('?') ? fullPath.split('?') : [fullPath, ''];
  const auth = getAuthHeader(method, basePath, query, config.accessKey, config.secretKey);

  // Dynamic import for proxy
  let agent;
  if (PROXY_URL) {
    const { HttpsProxyAgent } = await import('https-proxy-agent');
    agent = new HttpsProxyAgent(PROXY_URL);
  }

  const res = await fetch(`${COUPANG_API_URL}${fullPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Authorization': auth,
    },
    agent,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coupang API ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Main ───
async function syncDay(date, account) {
  const dateStr = date.replace(/-/g, '');
  // 쿠팡 API는 from==to이면 빈 결과 반환 → to를 +1일로 설정
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().split('T')[0].replace(/-/g, '');

  const config = { vendorId: account.vendorId, accessKey: account.accessKey, secretKey: account.secretKey };

  let allOrders = [];
  let nextToken;

  do {
    const params = new URLSearchParams({
      paidDateFrom: dateStr,
      paidDateTo: nextDayStr,
    });
    if (nextToken) params.append('nextToken', nextToken);

    const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${account.vendorId}/rg/orders?${params}`;
    const resp = await coupangFetch('GET', path, config);
    allOrders.push(...(resp.data || []));
    nextToken = resp.nextToken || null;
  } while (nextToken);

  // 해당 날짜에 해당하는 주문만 필터 (KST 기준, to 날짜 데이터 제외)
  allOrders = allOrders.filter(order => {
    const ts = typeof order.paidAt === 'number' ? order.paidAt : new Date(order.paidAt).getTime();
    const kstDate = new Date(ts + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
    return kstDate === date;
  });

  let synced = 0, skipped = 0, errors = 0;

  for (const order of allOrders) {
    try {
      const { data: existing } = await sb
        .from('rocket_growth_orders')
        .select('id')
        .eq('order_id', order.orderId)
        .single();

      if (existing) {
        await sb.from('rocket_growth_orders')
          .update({ raw_data: order, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        skipped++;
        continue;
      }

      // paidAt은 Unix timestamp(ms) → ISO 변환
      const paidAtISO = typeof order.paidAt === 'number'
        ? new Date(order.paidAt).toISOString()
        : order.paidAt;

      const { data: newOrder, error: err } = await sb
        .from('rocket_growth_orders')
        .insert({
          order_id: order.orderId,
          vendor_id: order.vendorId,
          paid_at: paidAtISO,
          raw_data: order,
          synced_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (err) { errors++; console.error(`  ❌ Order ${order.orderId}: ${err.message}`); continue; }

      if (order.orderItems?.length > 0) {
        const items = order.orderItems.map(item => ({
          rocket_growth_order_id: newOrder.id,
          vendor_item_id: item.vendorItemId,
          product_name: item.productName,
          sales_quantity: item.salesQuantity,
          sales_price: item.salesPrice,
          currency: item.currency,
        }));
        const { error: itemErr } = await sb.from('rocket_growth_order_items').insert(items);
        if (itemErr) { errors++; console.error(`  ❌ Items ${order.orderId}: ${itemErr.message}`); }
      }

      synced++;
    } catch (e) {
      errors++;
      console.error(`  ❌ ${order.orderId}: ${e.message}`);
    }
  }

  return { fetched: allOrders.length, synced, skipped, errors };
}

async function main() {
  const from = process.argv[2] || '2026-01-28';
  const to = process.argv[3] || '2026-02-01';

  console.log(`\n🚀 로켓그로스 백필: ${from} ~ ${to}`);
  console.log(`📦 계정: ${accounts.map(a => a.name).join(', ')}`);
  console.log(`🔌 프록시: ${PROXY_URL || '없음'}\n`);

  // Generate date range
  const dates = [];
  let d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }

  let totalSynced = 0, totalSkipped = 0, totalFetched = 0, totalErrors = 0;

  for (const date of dates) {
    for (const account of accounts) {
      process.stdout.write(`  ${date} [${account.name}] ... `);
      try {
        const r = await syncDay(date, account);
        console.log(`${r.fetched}건 조회, ${r.synced}건 신규, ${r.skipped}건 스킵${r.errors ? `, ${r.errors}건 에러` : ''}`);
        totalFetched += r.fetched;
        totalSynced += r.synced;
        totalSkipped += r.skipped;
        totalErrors += r.errors;
      } catch (e) {
        console.log(`❌ ${e.message}`);
        totalErrors++;
      }
    }
  }

  console.log(`\n✅ 완료: ${totalFetched}건 조회, ${totalSynced}건 신규, ${totalSkipped}건 스킵, ${totalErrors}건 에러\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
