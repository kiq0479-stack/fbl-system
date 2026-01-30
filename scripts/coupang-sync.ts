/**
 * 쿠팡 → Supabase 동기화 스크립트 (v3 - schema fixed)
 * 실행: npx tsx scripts/coupang-sync.ts
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(import.meta.dirname || __dirname, '..', '.env.local') });
delete process.env.PROXY_URL;

import { createClient } from '@supabase/supabase-js';
import { getCoupangAccounts, getOrders, getRocketGrowthOrders, accountToConfig, coupangRequest, type CoupangConfig } from '../src/lib/coupang';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── 헬퍼 ───
function formatDate(d: Date) { return d.toISOString().split('T')[0]; }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function splitDateRange(from: string, to: string, maxDays = 30) {
  const ranges: { from: string; to: string }[] = [];
  let cur = new Date(from);
  const end = new Date(to);
  while (cur < end) {
    const ce = new Date(cur); ce.setDate(ce.getDate() + maxDays);
    if (ce > end) ce.setTime(end.getTime());
    ranges.push({ from: formatDate(cur), to: formatDate(ce) });
    cur = new Date(ce); cur.setDate(cur.getDate() + 1);
  }
  return ranges;
}

async function supabaseRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } catch (e: any) {
      if (i === retries - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
  throw new Error('unreachable');
}

// 쿠팡 429 대응 래퍼
async function coupangCallWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try { return await fn(); } catch (e: any) {
      if (e.message?.includes('429') || e.message?.includes('Too many')) {
        const wait = 30 + i * 15;
        console.log(`    ⏳ 429 rate limit → ${wait}s 대기...`);
        await sleep(wait * 1000);
      } else throw e;
    }
  }
  throw new Error('429 retry exhausted');
}

// ─── 판매자 배송 주문 ───
async function syncOrders(fromDate: string, toDate: string) {
  console.log(`\n📦 판매자 배송: ${fromDate} ~ ${toDate}`);
  const accounts = getCoupangAccounts();
  let synced = 0, skipped = 0;

  for (const account of accounts) {
    const config = accountToConfig(account);
    for (const status of ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY']) {
      try {
        let nextToken: string | undefined;
        let all: any[] = [];
        do {
          const resp = await coupangCallWithRetry(() => getOrders(config, {
            vendorId: config.vendorId, createdAtFrom: fromDate, createdAtTo: toDate,
            status, maxPerPage: 50, nextToken,
          }));
          all.push(...(resp.data || []));
          nextToken = resp.nextToken;
          if (nextToken) await sleep(500);
        } while (nextToken);

        if (all.length === 0) continue;

        // 기존 확인 (batch)
        const boxIds = all.map(o => o.shipmentBoxId);
        const { data: existing } = await supabaseRetry(() =>
          supabase.from('coupang_orders').select('shipment_box_id').in('shipment_box_id', boxIds)
        );
        const existSet = new Set((existing || []).map((e: any) => e.shipment_box_id));
        const newOrders = all.filter(o => !existSet.has(o.shipmentBoxId));
        skipped += all.length - newOrders.length;

        if (newOrders.length === 0) continue;
        console.log(`  [${account.name}/${status}] +${newOrders.length}건`);

        // batch insert (50개씩)
        for (let i = 0; i < newOrders.length; i += 50) {
          const batch = newOrders.slice(i, i + 50);
          const rows = batch.map(o => ({
            shipment_box_id: o.shipmentBoxId, order_id: o.orderId, ordered_at: o.orderedAt,
            orderer_name: o.ordererName || '(비공개)', orderer_phone: o.ordererPhone || '',
            receiver_name: o.receiverName || '(비공개)', receiver_phone: o.receiverPhone || '',
            receiver_addr1: o.receiverAddr1 || '', receiver_addr2: o.receiverAddr2 || null,
            receiver_zip_code: o.receiverZipCode || '', status: o.status,
            synced_at: new Date().toISOString(),
          }));

          const { data: inserted, error } = await supabaseRetry(() =>
            supabase.from('coupang_orders').upsert(rows, { onConflict: 'shipment_box_id' }).select('id, shipment_box_id')
          );
          if (error) { console.log(`    ❌ ${error.message}`); continue; }

          // 아이템
          if (inserted) {
            const idMap = new Map(inserted.map((r: any) => [r.shipment_box_id, r.id]));
            const items: any[] = [];
            for (const o of batch) {
              const dbId = idMap.get(o.shipmentBoxId);
              if (!dbId) continue;
              for (const item of (o.orderItems || [])) {
                items.push({
                  coupang_order_id: dbId, vendor_item_id: item.vendorItemId,
                  vendor_item_name: item.vendorItemName, shipping_count: item.shippingCount,
                  sales_price: item.salesPrice, order_price: item.orderPrice,
                  discount_price: item.discountPrice || null,
                  external_vendor_sku_code: item.externalVendorSkuCode || null,
                  seller_product_id: item.sellerProductId, seller_product_name: item.sellerProductName,
                  seller_product_item_name: item.sellerProductItemName || null,
                });
              }
            }
            for (let j = 0; j < items.length; j += 50) {
              const { error: ie } = await supabaseRetry(() =>
                supabase.from('coupang_order_items').insert(items.slice(j, j + 50))
              );
              if (ie) console.log(`    ❌ items: ${ie.message}`);
            }
          }
          synced += batch.length;
        }
      } catch (e: any) { console.log(`    ❌ [${account.name}/${status}] ${e.message?.slice(0, 80)}`); }
    }
  }
  console.log(`  ✅ +${synced}, ${skipped} 스킵`);
}

// ─── 로켓그로스 ───
async function syncRocketGrowth(fromDate: string, toDate: string) {
  console.log(`\n🚀 로켓그로스: ${fromDate} ~ ${toDate}`);
  const accounts = getCoupangAccounts();
  let synced = 0;

  for (const account of accounts) {
    const config = accountToConfig(account);
    try {
      let nextToken: string | undefined;
      let all: any[] = [];
      do {
        const resp = await coupangCallWithRetry(() => getRocketGrowthOrders(config, {
          vendorId: config.vendorId,
          paidDateFrom: fromDate.replace(/-/g, ''),
          paidDateTo: toDate.replace(/-/g, ''),
          nextToken,
        }));
        all.push(...(resp.data || []));
        nextToken = resp.nextToken;
        if (nextToken) await sleep(500);
      } while (nextToken);

      if (all.length === 0) continue;

      // 기존 확인
      const oids = all.map(o => o.orderId);
      const { data: existing } = await supabaseRetry(() =>
        supabase.from('coupang_orders').select('order_id').in('order_id', oids)
      );
      const existSet = new Set((existing || []).map((e: any) => Number(e.order_id)));
      const newOrders = all.filter(o => !existSet.has(o.orderId));

      if (newOrders.length === 0) {
        console.log(`  [${account.name}] ${all.length}건 모두 기존`);
        continue;
      }
      console.log(`  [${account.name}] +${newOrders.length}건 (${all.length - newOrders.length} 스킵)`);

      for (let i = 0; i < newOrders.length; i += 50) {
        const batch = newOrders.slice(i, i + 50);
        const rows = batch.map(o => ({
          order_id: o.orderId, shipment_box_id: o.orderId,
          ordered_at: new Date(o.paidAt).toISOString(),
          orderer_name: '(로켓그로스)', orderer_phone: '',
          receiver_name: '(로켓그로스)', receiver_phone: '',
          receiver_addr1: '', receiver_zip_code: '',
          status: 'FINAL_DELIVERY', synced_at: new Date().toISOString(),
        }));

        const { data: inserted, error } = await supabaseRetry(() =>
          supabase.from('coupang_orders').upsert(rows, { onConflict: 'shipment_box_id' }).select('id, order_id')
        );
        if (error) { console.log(`    ❌ ${error.message}`); continue; }

        if (inserted) {
          const idMap = new Map(inserted.map((r: any) => [Number(r.order_id), r.id]));
          const items: any[] = [];
          for (const o of batch) {
            const dbId = idMap.get(o.orderId);
            if (!dbId) continue;
            for (const item of (o.orderItems || [])) {
              items.push({
                coupang_order_id: dbId, vendor_item_id: item.vendorItemId,
                vendor_item_name: item.productName || '', shipping_count: item.salesQuantity || 0,
                sales_price: item.salesPrice || 0, order_price: item.salesPrice || 0,
                seller_product_id: 0, seller_product_name: item.productName || '',
              });
            }
          }
          for (let j = 0; j < items.length; j += 50) {
            const { error: ie } = await supabaseRetry(() =>
              supabase.from('coupang_order_items').insert(items.slice(j, j + 50))
            );
            if (ie) console.log(`    ❌ items: ${ie.message}`);
          }
        }
        synced += batch.length;
      }
    } catch (e: any) { console.log(`    ❌ [${account.name}] ${e.message?.slice(0, 80)}`); }
  }
  console.log(`  ✅ +${synced}`);
}

// ─── 매출 (실제 DB 스키마 맞춤) ───
// DB: order_id, vendor_id, sale_type, sale_date, recognition_date, settlement_date, items(JSON), raw_data
// unique: order_id, vendor_id
async function syncRevenue(fromDate: string, toDate: string) {
  console.log(`\n💰 매출: ${fromDate} ~ ${toDate}`);
  const accounts = getCoupangAccounts();
  let synced = 0;

  for (const account of accounts) {
    const config = accountToConfig(account);
    try {
      // 쿠팡 매출내역 API는 per-order + items[] 구조
      // 직접 API 호출 (getRevenueHistory 반환 타입이 실제와 다를 수 있어서)
      let nextToken: string | undefined;
      let allRaw: any[] = [];

      do {
        const params = new URLSearchParams();
        params.append('vendorId', config.vendorId);
        params.append('recognitionDateFrom', fromDate);
        params.append('recognitionDateTo', toDate);
        params.append('maxPerPage', '50');
        params.append('token', nextToken || '');
        const apiPath = `/v2/providers/openapi/apis/api/v1/revenue-history?${params.toString()}`;

        const resp: any = await coupangCallWithRetry(() =>
          coupangRequest<any>('GET', apiPath, config)
        );

        const data = resp.data || [];
        allRaw.push(...data.map((d: any) => ({ ...d, _vendorId: config.vendorId })));
        nextToken = resp.nextToken;
        if (nextToken) await sleep(500);
      } while (nextToken);

      if (allRaw.length === 0) continue;
      console.log(`  [${account.name}] ${allRaw.length}건`);

      // DB 형식으로 변환
      const rows = allRaw.map((r: any) => ({
        order_id: String(r.orderId),
        vendor_id: r._vendorId,
        sale_type: r.saleType || 'SALE',
        sale_date: r.saleDate,
        recognition_date: r.recognitionDate,
        settlement_date: r.settlementDate,
        items: r.items || [],
        raw_data: r,
        updated_at: new Date().toISOString(),
      }));

      // 50개씩 upsert
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await supabaseRetry(() =>
          supabase.from('coupang_revenues').upsert(batch, { onConflict: 'order_id,vendor_id' })
        );
        if (error) console.log(`    ❌ ${error.message}`);
        else synced += batch.length;
      }
    } catch (e: any) { console.log(`    ❌ [${account.name}] ${e.message?.slice(0, 80)}`); }
  }
  console.log(`  ✅ ${synced}건 upsert`);
}

// ─── 검증 ───
async function verify() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🔍 검증`);

  for (const t of ['coupang_orders', 'coupang_order_items', 'coupang_revenues']) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
    console.log(`  ${t}: ${count}건`);
  }

  // 상품별 판매량
  const { data: items } = await supabase.from('coupang_order_items').select('vendor_item_id, vendor_item_name, shipping_count');
  const salesMap = new Map<string, { name: string; qty: number }>();
  items?.forEach((i: any) => {
    const vid = i.vendor_item_id?.toString();
    if (!vid) return;
    const e = salesMap.get(vid) || { name: i.vendor_item_name || '', qty: 0 };
    e.qty += i.shipping_count || 0;
    salesMap.set(vid, e);
  });

  const { data: mappings } = await supabase.from('product_mappings')
    .select('external_option_id, products(name)').eq('is_active', true).eq('marketplace', 'coupang');
  const { data: products } = await supabase.from('products').select('id, sku, name').eq('is_active', true);

  console.log(`\n📊 매칭 상품 판매량:`);
  const mapped = new Set<string>();
  mappings?.forEach((m: any) => {
    const vid = m.external_option_id?.toString();
    if (vid) mapped.add(vid);
    const s = vid ? salesMap.get(vid) : undefined;
    if (s) console.log(`  ✅ ${m.products?.name} → ${s.qty}개`);
  });

  console.log(`\n  미매칭 VID:`);
  salesMap.forEach((v, vid) => {
    if (!mapped.has(vid)) console.log(`  ❌ ${vid} (${v.name?.slice(0, 30)}) → ${v.qty}개`);
  });

  // 매출 요약
  const { data: revs } = await supabase.from('coupang_revenues').select('items, sale_date');
  let totalQty = 0, totalAmt = 0;
  revs?.forEach((r: any) => {
    (r.items || []).forEach((item: any) => {
      totalQty += item.quantity || 0;
      totalAmt += item.settlementAmount || 0;
    });
  });
  console.log(`\n💰 매출 합계: ${revs?.length}건, ${totalQty}개 판매, 정산 ₩${totalAmt.toLocaleString()}`);
  console.log('='.repeat(50));
}

// ─── 메인 ───
async function main() {
  console.log('🔄 쿠팡 Sync v3');
  console.log(`  계정: ${getCoupangAccounts().map(a => a.name).join(', ')}`);

  const from = formatDate(daysAgo(120));
  const to = formatDate(new Date());
  const yesterday = formatDate(daysAgo(1));
  const ranges = splitDateRange(from, to, 30);
  const revRanges = splitDateRange(from, yesterday, 30);

  console.log(`  기간: ${from} ~ ${to} | 청크 ${ranges.length}회`);

  // 판매자 배송
  for (const r of ranges) { await syncOrders(r.from, r.to); await sleep(1000); }

  // 로켓그로스
  for (const r of ranges) { await syncRocketGrowth(r.from, r.to); await sleep(2000); }

  // 매출
  for (const r of revRanges) { await syncRevenue(r.from, r.to); await sleep(2000); }

  await verify();
  console.log('\n✅ 완료!');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
