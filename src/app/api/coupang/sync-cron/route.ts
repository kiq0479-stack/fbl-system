import { NextResponse } from 'next/server';
import { getOrders, getCoupangAccounts, CoupangOrderSheet } from '@/lib/coupang';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy 초기화 (빌드 타임에 throw 방지)
let _supabase: SupabaseClient | null = null;
function getSupabase() {
  if (!_supabase) {
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !supabaseKey) {
      throw new Error('Supabase environment variables are not configured');
    }
    _supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey);
  }
  return _supabase;
}

// Priority order: ACCEPT captures new orders, FINAL_DELIVERY confirms them
const PRIORITY_STATUSES = ['ACCEPT', 'FINAL_DELIVERY', 'INSTRUCT', 'DEPARTURE', 'DELIVERING'];
const MAX_RUNTIME_MS = 8000;

function getKSTDateString(daysAgo: number): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setDate(kst.getDate() - daysAgo);
  return kst.toISOString().split('T')[0];
}

async function syncDateStatus(
  date: string,
  status: string,
  startTime: number,
): Promise<{ synced: number; skipped: number; fetched: number; errors: string[] }> {
  const accounts = getCoupangAccounts();
  let synced = 0, skipped = 0, fetched = 0;
  const errors: string[] = [];

  for (const account of accounts) {
    if (Date.now() - startTime > MAX_RUNTIME_MS) break;

    const config = {
      vendorId: account.vendorId,
      accessKey: account.accessKey,
      secretKey: account.secretKey,
    };

    try {
      let allOrders: CoupangOrderSheet[] = [];
      let nextToken: string | undefined;

      do {
        const response = await getOrders(config, {
          vendorId: config.vendorId,
          createdAtFrom: date,
          createdAtTo: date,
          status,
          maxPerPage: 50,
          nextToken,
        });
        allOrders.push(...(response.data || []));
        nextToken = response.nextToken || undefined;
      } while (nextToken && Date.now() - startTime < MAX_RUNTIME_MS);

      if (allOrders.length === 0) continue;
      fetched += allOrders.length;

      // Batch check existing
      const shipmentBoxIds = allOrders.map(o => o.shipmentBoxId);
      const { data: existing } = await getSupabase()
        .from('coupang_orders')
        .select('id, shipment_box_id, status')
        .in('shipment_box_id', shipmentBoxIds);

      const existingMap = new Map(
        (existing || []).map(e => [e.shipment_box_id, { id: e.id, status: e.status }])
      );

      for (const order of allOrders) {
        if (Date.now() - startTime > MAX_RUNTIME_MS) break;

        const existingOrder = existingMap.get(order.shipmentBoxId);
        if (existingOrder) {
          if (existingOrder.status !== order.status) {
            await getSupabase()
              .from('coupang_orders')
              .update({ status: order.status, updated_at: new Date().toISOString() })
              .eq('id', existingOrder.id);
            synced++;
          } else {
            skipped++;
          }
          continue;
        }

        const { data: newOrder, error: orderError } = await getSupabase()
          .from('coupang_orders')
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

        if (orderError) {
          errors.push(`[${account.name}] ${order.orderId}: ${orderError.message}`);
          continue;
        }

        if (order.orderItems?.length > 0) {
          const items = order.orderItems.map((item: any) => ({
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

          const { error: itemsError } = await getSupabase()
            .from('coupang_order_items')
            .insert(items);

          if (itemsError) {
            errors.push(`[${account.name}] Items ${order.orderId}: ${itemsError.message}`);
          }
        }

        synced++;
      }
    } catch (err) {
      errors.push(`[${account.name}] ${status}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  return { synced, skipped, fetched, errors };
}

/**
 * Daily cron endpoint for Coupang order sync.
 * Syncs yesterday + today's orders with priority-ordered statuses.
 * Stops if approaching Vercel timeout.
 * 
 * Vercel Cron calls this as GET.
 */
export async function GET() {
  const startTime = Date.now();
  const yesterday = getKSTDateString(1);
  const today = getKSTDateString(0);
  const dates = [yesterday, today];

  let totalSynced = 0;
  let totalSkipped = 0;
  let totalFetched = 0;
  let statusesProcessed = 0;
  const allErrors: string[] = [];

  for (const date of dates) {
    for (const status of PRIORITY_STATUSES) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) break;

      const result = await syncDateStatus(date, status, startTime);
      totalSynced += result.synced;
      totalSkipped += result.skipped;
      totalFetched += result.fetched;
      allErrors.push(...result.errors);
      statusesProcessed++;
    }
  }

  const elapsed = Date.now() - startTime;

  // Log
  try {
    await getSupabase().from('api_sync_logs').insert({
      channel: 'coupang',
      sync_type: 'orders-cron',
      status: allErrors.length > 0 ? 'partial' : 'success',
      records_count: totalSynced,
      error_message: allErrors.length > 0 ? allErrors.slice(0, 5).join('; ') : null,
      completed_at: new Date().toISOString(),
    });
  } catch (_) { /* ignore */ }

  return NextResponse.json({
    success: true,
    dates,
    statuses_processed: statusesProcessed,
    synced: totalSynced,
    skipped: totalSkipped,
    total_fetched: totalFetched,
    elapsed_ms: elapsed,
    errors: allErrors.length > 0 ? allErrors : undefined,
  });
}
