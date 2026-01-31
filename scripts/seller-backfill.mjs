#!/usr/bin/env node
/**
 * 쿠팡 판매자배송 주문 백필 스크립트
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import nodeFetch from 'node-fetch';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const PROXY_URL = process.env.PROXY_URL;

function getAuth(method, basePath, query, accessKey, secretKey) {
  const dt = new Date().toISOString().substr(2,17).replace(/[-:]/g,'')+'Z';
  const sig = crypto.createHmac('sha256', secretKey).update(dt+method+basePath+query).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${dt}, signature=${sig}`;
}

async function coupangGet(fullPath, config) {
  const [bp, q] = fullPath.includes('?') ? fullPath.split('?') : [fullPath, ''];
  const auth = getAuth('GET', bp, q, config.accessKey, config.secretKey);
  const agent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : undefined;
  const res = await nodeFetch(`https://api-gateway.coupang.com${fullPath}`, {
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

const STATUSES = ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY'];

async function syncSellerOrders(date, account) {
  const config = { vendorId: account.vendorId, accessKey: account.accessKey, secretKey: account.secretKey };
  let totalSynced = 0, totalSkipped = 0, totalFetched = 0, totalErrors = 0;

  for (const status of STATUSES) {
    let allOrders = [];
    let nextToken;

    do {
      const params = new URLSearchParams({
        createdAtFrom: date,
        createdAtTo: date,
        status,
        maxPerPage: '50',
      });
      if (nextToken) params.append('nextToken', nextToken);

      const path = `/v2/providers/openapi/apis/api/v4/vendors/${account.vendorId}/ordersheets?${params}`;

      try {
        const resp = await coupangGet(path, config);
        allOrders.push(...(resp.data || []));
        nextToken = resp.nextToken || undefined;
      } catch (e) {
        console.log(`    [ERR] ${status}: ${e.message}`);
        break;
      }
    } while (nextToken);

    totalFetched += allOrders.length;

    for (const order of allOrders) {
      try {
        const { data: existing } = await sb.from('coupang_orders')
          .select('id, status')
          .eq('shipment_box_id', order.shipmentBoxId)
          .single();

        if (existing) {
          if (existing.status !== order.status) {
            await sb.from('coupang_orders')
              .update({ status: order.status, updated_at: new Date().toISOString() })
              .eq('id', existing.id);
            totalSynced++;
          } else {
            totalSkipped++;
          }
          continue;
        }

        const { data: newOrder, error: err } = await sb.from('coupang_orders')
          .insert({
            shipment_box_id: order.shipmentBoxId,
            order_id: order.orderId,
            ordered_at: order.orderedAt,
            orderer_name: order.ordererName || '(비공개)',
            orderer_phone: order.ordererPhone || null,
            receiver_name: order.receiverName || '(비공개)',
            receiver_phone: order.receiverPhone || '',
            receiver_addr1: order.receiverAddr1 || '',
            receiver_addr2: order.receiverAddr2 || null,
            receiver_zip_code: order.receiverZipCode || '',
            status: order.status,
            synced_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (err) { totalErrors++; console.log(`    ❌ ${order.orderId}: ${err.message}`); continue; }

        if (order.orderItems?.length > 0) {
          const items = order.orderItems.map(item => ({
            coupang_order_id: newOrder.id,
            vendor_item_id: item.vendorItemId,
            vendor_item_name: item.vendorItemName,
            shipping_count: item.shippingCount,
            sales_price: item.salesPrice,
            order_price: item.orderPrice,
            discount_price: item.discountPrice || null,
            external_vendor_sku_code: item.externalVendorSkuCode || null,
            seller_product_id: item.sellerProductId,
            seller_product_name: item.sellerProductName,
            seller_product_item_name: item.sellerProductItemName || null,
          }));
          const { error: itemErr } = await sb.from('coupang_order_items').insert(items);
          if (itemErr) { totalErrors++; console.log(`    ❌ Items ${order.orderId}: ${itemErr.message}`); }
        }

        totalSynced++;
      } catch (e) {
        totalErrors++;
      }
    }

    // rate limit 대응
    await new Promise(r => setTimeout(r, 500));
  }

  return { fetched: totalFetched, synced: totalSynced, skipped: totalSkipped, errors: totalErrors };
}

async function main() {
  const from = process.argv[2] || '2026-01-30';
  const to = process.argv[3] || '2026-02-01';

  console.log(`\n🛒 판매자배송 백필: ${from} ~ ${to}`);

  const dates = [];
  let d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }

  let totalSynced = 0, totalFetched = 0;

  for (const date of dates) {
    for (const acc of accounts()) {
      process.stdout.write(`  ${date} [${acc.name}] ... `);
      const r = await syncSellerOrders(date, acc);
      console.log(`${r.fetched}건 조회, ${r.synced}건 신규, ${r.skipped}건 스킵${r.errors ? `, ${r.errors}건 에러` : ''}`);
      totalFetched += r.fetched;
      totalSynced += r.synced;
    }
  }

  console.log(`\n✅ 완료: ${totalFetched}건 조회, ${totalSynced}건 신규\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
