import { NextRequest, NextResponse } from 'next/server';
import { getRevenueHistory, getCoupangConfig } from '@/lib/coupang';
import { createClient } from '@supabase/supabase-js';

// Service Role Key가 없으면 Anon Key 사용 (RLS 정책 필요)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !supabaseKey) {
  throw new Error('Supabase environment variables are not configured');
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey
);

export async function POST(request: NextRequest) {
  try {
    const config = getCoupangConfig();
    const body = await request.json();
    const { from, to } = body;
    
    if (!from || !to) {
      return NextResponse.json(
        { success: false, error: 'from, to 파라미터가 필요합니다.' },
        { status: 400 }
      );
    }
    
    // 매출내역 조회
    const response = await getRevenueHistory(config, {
      vendorId: config.vendorId,
      recognitionDateFrom: from,
      recognitionDateTo: to,
    });

    if (!response.data || response.data.length === 0) {
      return NextResponse.json({
        success: true,
        message: '동기화할 매출내역이 없습니다.',
        synced: 0,
      });
    }

    // DB에 저장 (upsert)
    let synced = 0;
    const errors: string[] = [];

    for (const revenue of response.data) {
      try {
        // 매출내역 저장 (coupang_revenues 테이블 필요)
        const { error } = await supabase
          .from('coupang_revenues')
          .upsert({
            order_id: String(revenue.orderId),
            vendor_id: config.vendorId,
            vendor_item_id: revenue.vendorItemId,
            vendor_item_name: revenue.vendorItemName,
            quantity: revenue.quantity,
            sale_price: revenue.salePrice,
            discount_price: revenue.discountPrice,
            settlement_price: revenue.settlementPrice,
            recognized_at: revenue.recognizedAt,
            ordered_at: revenue.orderedAt,
            delivered_at: revenue.deliveredAt,
            shipment_type: revenue.shipmentType,
            seller_product_id: revenue.sellerProductId,
            seller_product_name: revenue.sellerProductName,
            raw_data: revenue,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'order_id,vendor_id,vendor_item_id',
          });

        if (error) {
          errors.push(`Order ${revenue.orderId}: ${error.message}`);
        } else {
          synced++;
        }
      } catch (err) {
        errors.push(`Order ${revenue.orderId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${synced}건의 매출내역이 동기화되었습니다.${errors.length > 0 ? ` (${errors.length}건 오류)` : ''}`,
      synced,
      total: response.data.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Revenue Sync Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
