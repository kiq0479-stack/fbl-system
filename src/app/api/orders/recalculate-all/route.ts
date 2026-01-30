import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

let _supabase: SupabaseClient | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

export async function POST() {
  try {
    // 모든 주문 조회
    const { data: orders, error: ordersError } = await getSupabase()
      .from('orders')
      .select('id');

    if (ordersError) throw ordersError;

    const results = [];

    for (const order of orders || []) {
      // 주문 품목 조회
      const { data: items, error: itemsError } = await getSupabase()
        .from('order_items')
        .select('*, product:products(cbm)')
        .eq('order_id', order.id);

      if (itemsError) {
        results.push({ id: order.id, error: itemsError.message });
        continue;
      }

      if (!items || items.length === 0) {
        results.push({ id: order.id, skipped: true, reason: 'no items' });
        continue;
      }

      // 총액 계산
      const totalCbm = items.reduce((acc: number, item: any) => {
        const qty = item.commercial_qty ?? item.pre_qty;
        const cbm = item.product?.cbm || 0;
        return acc + (qty * cbm);
      }, 0);

      const totalAmountUsd = items.reduce((acc: number, item: any) => {
        const qty = item.commercial_qty ?? item.pre_qty;
        const price = item.unit_price_usd || 0;
        return acc + (qty * price);
      }, 0);

      const totalAmountRmb = items.reduce((acc: number, item: any) => {
        const qty = item.commercial_qty ?? item.pre_qty;
        const price = item.unit_price_rmb || 0;
        return acc + (qty * price);
      }, 0);

      // 주문 업데이트
      const { error: updateError } = await getSupabase()
        .from('orders')
        .update({
          total_cbm: Math.round(totalCbm * 100) / 100,
          total_amount_usd: Math.round(totalAmountUsd * 100) / 100,
          total_amount_rmb: Math.round(totalAmountRmb * 100) / 100,
        })
        .eq('id', order.id);

      if (updateError) {
        results.push({ id: order.id, error: updateError.message });
      } else {
        results.push({ 
          id: order.id, 
          success: true, 
          totalCbm: Math.round(totalCbm * 100) / 100,
          totalAmountUsd: Math.round(totalAmountUsd * 100) / 100,
          totalAmountRmb: Math.round(totalAmountRmb * 100) / 100,
        });
      }
    }

    return NextResponse.json({ 
      message: '재계산 완료', 
      total: orders?.length || 0,
      results 
    });

  } catch (error) {
    console.error('Recalculate error:', error);
    return NextResponse.json(
      { error: '재계산 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
