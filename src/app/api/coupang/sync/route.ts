import { NextRequest, NextResponse } from 'next/server';
import { getOrders, getCoupangConfig } from '@/lib/coupang';
import { createClient } from '@supabase/supabase-js';

// Service Role Key가 없으면 Anon Key 사용
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !supabaseKey) {
  throw new Error('Supabase environment variables are not configured');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey
);

// 쿠팡 주문 동기화 API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { from, to, status } = body;

    if (!from || !to || !status) {
      return NextResponse.json(
        { error: 'from, to, status 파라미터가 필요합니다.' },
        { status: 400 }
      );
    }

    const config = getCoupangConfig();

    // 쿠팡 주문 조회
    const coupangResponse = await getOrders(config, {
      vendorId: config.vendorId,
      createdAtFrom: from,
      createdAtTo: to,
      status,
      maxPerPage: 50,
    });

    const orders = coupangResponse.data || [];
    
    if (orders.length === 0) {
      return NextResponse.json({
        success: true,
        message: '동기화할 주문이 없습니다.',
        synced: 0,
        skipped: 0,
      });
    }

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const order of orders) {
      try {
        // 이미 존재하는 주문인지 확인
        const { data: existing } = await supabase
          .from('coupang_orders')
          .select('id, status')
          .eq('shipment_box_id', order.shipmentBoxId)
          .single();

        if (existing) {
          // 상태가 변경된 경우에만 업데이트
          if (existing.status !== order.status) {
            await supabase
              .from('coupang_orders')
              .update({
                status: order.status,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
            synced++;
          } else {
            skipped++;
          }
          continue;
        }

        // 새 주문 삽입
        const { data: newOrder, error: orderError } = await supabase
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
            status: order.status as 'ACCEPT' | 'INSTRUCT' | 'DEPARTURE' | 'DELIVERING' | 'FINAL_DELIVERY',
            synced_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (orderError) {
          errors.push(`Order ${order.orderId}: ${orderError.message}`);
          continue;
        }

        // 주문 아이템 삽입
        if (order.orderItems && order.orderItems.length > 0) {
          const itemsToInsert = order.orderItems.map(item => ({
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

          const { error: itemsError } = await supabase
            .from('coupang_order_items')
            .insert(itemsToInsert);

          if (itemsError) {
            errors.push(`Order ${order.orderId} items: ${itemsError.message}`);
          }
        }

        synced++;
      } catch (err) {
        errors.push(`Order ${order.orderId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // 동기화 로그 기록
    await supabase.from('api_sync_logs').insert({
      channel: 'coupang',
      sync_type: 'orders',
      status: errors.length > 0 ? 'failed' : 'success',
      records_count: synced,
      error_message: errors.length > 0 ? errors.join('; ') : null,
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: `동기화 완료: ${synced}건 처리, ${skipped}건 스킵`,
      synced,
      skipped,
      total: orders.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Coupang Sync Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
