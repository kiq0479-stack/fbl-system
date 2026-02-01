import { NextRequest, NextResponse } from 'next/server';
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

// Vercel Pro: allow up to 60s execution
export const maxDuration = 60;

const ORDER_STATUSES = ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY'];
const MAX_RUNTIME_MS = 50000; // 50s safety margin for Vercel Pro 60s limit

/**
 * Lightweight sync endpoint — syncs ONE day of Coupang orders.
 * 
 * GET /api/coupang/sync-chunk?date=2025-06-01
 * GET /api/coupang/sync-chunk?date=2025-06-01&status=ACCEPT
 * 
 * Designed to run well within Vercel's 10s timeout.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const statusParam = searchParams.get('status');

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'date parameter required (YYYY-MM-DD format)' },
      { status: 400 }
    );
  }

  const statuses = statusParam ? [statusParam] : ORDER_STATUSES;
  const accounts = getCoupangAccounts();

  let totalSynced = 0;
  let totalSkipped = 0;
  let totalOrders = 0;
  let statusesProcessed = 0;
  const errors: string[] = [];

  for (const orderStatus of statuses) {
    // Timeout guard
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      errors.push(`Timeout guard: stopped after ${statusesProcessed} statuses`);
      break;
    }

    for (const account of accounts) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) break;

      const config = {
        vendorId: account.vendorId,
        accessKey: account.accessKey,
        secretKey: account.secretKey,
      };

      try {
        // Fetch all pages of orders for this date+status+account
        let allOrders: CoupangOrderSheet[] = [];
        let nextToken: string | undefined;

        do {
          const response = await getOrders(config, {
            vendorId: config.vendorId,
            createdAtFrom: date,
            createdAtTo: date,
            status: orderStatus,
            maxPerPage: 50,
            nextToken,
          });

          allOrders.push(...(response.data || []));
          nextToken = response.nextToken || undefined;
        } while (nextToken && Date.now() - startTime < MAX_RUNTIME_MS);

        if (allOrders.length === 0) continue;
        totalOrders += allOrders.length;

        // Batch check existing orders
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
            // Update status if changed
            if (existingOrder.status !== order.status) {
              await getSupabase()
                .from('coupang_orders')
                .update({ status: order.status, updated_at: new Date().toISOString() })
                .eq('id', existingOrder.id);
              totalSynced++;
            } else {
              totalSkipped++;
            }
            continue;
          }

          // Insert new order
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
            errors.push(`[${account.name}] Order ${order.orderId}: ${orderError.message}`);
            continue;
          }

          // Insert order items
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

          totalSynced++;
        }
      } catch (err) {
        errors.push(`[${account.name}] ${orderStatus}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
    statusesProcessed++;
  }

  const elapsed = Date.now() - startTime;

  // Log sync result
  try {
    await getSupabase().from('api_sync_logs').insert({
      channel: 'coupang',
      sync_type: 'orders-chunk',
      status: errors.length > 0 ? 'partial' : 'success',
      records_count: totalSynced,
      error_message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
      completed_at: new Date().toISOString(),
    });
  } catch (_) { /* ignore log errors */ }

  return NextResponse.json({
    success: true,
    date,
    statuses_processed: statusesProcessed,
    synced: totalSynced,
    skipped: totalSkipped,
    total_fetched: totalOrders,
    elapsed_ms: elapsed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
