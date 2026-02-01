import { NextRequest, NextResponse } from 'next/server';
import { getRocketGrowthOrders, getCoupangAccounts } from '@/lib/coupang';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Vercel Pro: allow up to 60s execution
export const maxDuration = 60;

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

// 날짜를 yyyymmdd 형식으로 변환
function formatDateToYYYYMMDD(dateStr: string): string {
  // YYYY-MM-DD -> yyyymmdd
  return dateStr.replace(/-/g, '');
}

// KST 기준 날짜 문자열 (YYYY-MM-DD)
function getKSTDateString(daysAgo: number): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setDate(kst.getDate() - daysAgo);
  return kst.toISOString().split('T')[0];
}

// 주문 upsert 공통 로직
async function syncOrders(orders: any[]): Promise<{ synced: number; skipped: number; errors: string[] }> {
  let synced = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const order of orders) {
    try {
      const { data: existing } = await getSupabase()
        .from('rocket_growth_orders')
        .select('id')
        .eq('order_id', order.orderId)
        .single();

      if (existing) {
        await getSupabase()
          .from('rocket_growth_orders')
          .update({
            raw_data: order,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        skipped++;
        continue;
      }

      // paidAt: Unix timestamp(ms) → ISO string 변환
      const paidAtISO = typeof order.paidAt === 'number'
        ? new Date(order.paidAt).toISOString()
        : order.paidAt;

      const { data: newOrder, error: orderError } = await getSupabase()
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

      if (orderError) {
        errors.push(`Order ${order.orderId}: ${orderError.message}`);
        continue;
      }

      if (order.orderItems && order.orderItems.length > 0) {
        const itemsToInsert = order.orderItems.map((item: any) => ({
          rocket_growth_order_id: newOrder.id,
          vendor_item_id: item.vendorItemId,
          product_name: item.productName,
          sales_quantity: item.salesQuantity,
          sales_price: item.salesPrice,
          currency: item.currency,
        }));

        const { error: itemsError } = await getSupabase()
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

  return { synced, skipped, errors };
}

// 쿠팡 API에서 주문 fetch
async function fetchRocketOrders(from: string, to: string): Promise<any[]> {
  const accounts = getCoupangAccounts();
  let orders: any[] = [];

  for (const account of accounts) {
    const config = {
      vendorId: account.vendorId,
      accessKey: account.accessKey,
      secretKey: account.secretKey,
    };

    try {
      let nextToken: string | undefined;
      do {
        const response = await getRocketGrowthOrders(config, {
          vendorId: config.vendorId,
          paidDateFrom: formatDateToYYYYMMDD(from),
          paidDateTo: formatDateToYYYYMMDD(to),
          nextToken,
        });

        const ordersWithAccount = (response.data || []).map((order: any) => ({
          ...order,
          _accountName: account.name,
        }));
        orders = [...orders, ...ordersWithAccount];
        nextToken = response.nextToken || undefined;
      } while (nextToken);
    } catch (err) {
      console.error(`[${account.name}] 로켓그로스 주문 조회 실패:`, err);
    }
  }

  return orders;
}

/**
 * Vercel Cron용 GET 핸들러
 * 매일 자동 실행: 최근 4일간 로켓그로스 주문 동기화
 * (쿠팡 데이터 반영 지연 대응으로 4일 윈도우)
 */
export async function GET() {
  const startTime = Date.now();

  try {
    // 최근 4일 (오늘~3일전) — 쿠팡 데이터 지연 대응
    const from = getKSTDateString(3);
    const to = getKSTDateString(0);

    const orders = await fetchRocketOrders(from, to);

    if (orders.length === 0) {
      return NextResponse.json({
        success: true,
        message: '동기화할 주문이 없습니다.',
        period: { from, to },
        synced: 0,
        skipped: 0,
        elapsed_ms: Date.now() - startTime,
      });
    }

    const { synced, skipped, errors } = await syncOrders(orders);

    // 동기화 로그
    await getSupabase().from('api_sync_logs').insert({
      channel: 'coupang',
      sync_type: 'rocket_growth_orders_cron',
      status: errors.length > 0 ? 'partial' : 'success',
      records_count: synced,
      error_message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      period: { from, to },
      synced,
      skipped,
      total: orders.length,
      elapsed_ms: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Rocket Growth Cron Sync Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// 로켓그로스 주문 동기화 API (수동 호출용)
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

    const orders = await fetchRocketOrders(from, to);

    if (orders.length === 0) {
      return NextResponse.json({
        success: true,
        message: '동기화할 주문이 없습니다.',
        synced: 0,
        skipped: 0,
      });
    }

    const { synced, skipped, errors } = await syncOrders(orders);

    // 동기화 로그 기록
    await getSupabase().from('api_sync_logs').insert({
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
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
