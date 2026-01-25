import { NextRequest, NextResponse } from 'next/server';
import { getRocketGrowthOrders, getCoupangConfig } from '@/lib/coupang';
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

// 날짜를 yyyymmdd 형식으로 변환
function formatDateToYYYYMMDD(dateStr: string): string {
  // YYYY-MM-DD -> yyyymmdd
  return dateStr.replace(/-/g, '');
}

// 로켓그로스 주문 동기화 API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { from, to } = body;

    if (!from || !to) {
      return NextResponse.json(
        { error: 'from, to 파라미터가 필요합니다. (YYYY-MM-DD 형식)' },
        { status: 400 }
      );
    }

    const config = getCoupangConfig();

    // 로켓그로스 주문 조회 (결제일 기준, paidDateFrom/paidDateTo)
    const response = await getRocketGrowthOrders(config, {
      vendorId: config.vendorId,
      paidDateFrom: formatDateToYYYYMMDD(from),
      paidDateTo: formatDateToYYYYMMDD(to),
    });

    const orders = response.data || [];
    
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
        // 이미 존재하는 주문인지 확인 (rocket_growth_orders 테이블 사용)
        const { data: existing } = await supabase
          .from('rocket_growth_orders')
          .select('id')
          .eq('order_id', order.orderId)
          .single();

        if (existing) {
          // 이미 존재하면 raw_data만 업데이트
          await supabase
            .from('rocket_growth_orders')
            .update({
              raw_data: order,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          skipped++;
          continue;
        }

        // 새 주문 삽입
        const { data: newOrder, error: orderError } = await supabase
          .from('rocket_growth_orders')
          .insert({
            order_id: order.orderId,
            vendor_id: order.vendorId,
            paid_at: order.paidAt,
            raw_data: order,
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
            rocket_growth_order_id: newOrder.id,
            vendor_item_id: item.vendorItemId,
            product_name: item.productName,
            sales_quantity: item.salesQuantity,
            sales_price: item.salesPrice,
            currency: item.currency,
          }));

          const { error: itemsError } = await supabase
            .from('rocket_growth_order_items')
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
      sync_type: 'rocket_growth_orders',
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
    console.error('Rocket Growth Sync Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
