import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getProductOrders,
  getNaverAccounts,
  accountToConfig,
  NaverConfig,
  NaverAccount,
  NaverRangeType,
} from '@/lib/naver';

export const maxDuration = 300; // 5분 타임아웃

// ============================================================================
// Supabase 클라이언트 (service role key 우선 사용)
// ============================================================================
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

// ============================================================================
// 날짜 유틸리티
// ============================================================================

function formatDateKST(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD → ISO KST 시작 시각 */
function toKSTStart(dateStr: string): string {
  return `${dateStr}T00:00:00.000+09:00`;
}

/** YYYY-MM-DD → ISO KST 종료 시각 */
function toKSTEnd(dateStr: string): string {
  return `${dateStr}T23:59:59.999+09:00`;
}

/** 날짜 범위를 24시간 단위로 분할 (네이버 API 제한 대응) */
function splitDateRange(fromStr: string, toStr: string): Array<{ from: string; to: string }> {
  const fromDate = new Date(fromStr + 'T00:00:00+09:00');
  const toDate = new Date(toStr + 'T00:00:00+09:00');
  const ranges: Array<{ from: string; to: string }> = [];
  const current = new Date(fromDate);

  while (current <= toDate) {
    const dateStr = formatDateKST(current);
    ranges.push({
      from: toKSTStart(dateStr),
      to: toKSTEnd(dateStr),
    });
    current.setDate(current.getDate() + 1);
  }
  return ranges;
}

/** KST 기준 N일 전 날짜 문자열 (YYYY-MM-DD) */
function getKSTDaysAgo(daysAgo: number): string {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  kstNow.setDate(kstNow.getDate() - daysAgo);
  return formatDateKST(kstNow);
}

// ============================================================================
// 단일 계정 + 날짜 범위 주문 조회
// ============================================================================

async function fetchOrdersForDateRange(
  config: NaverConfig,
  account: NaverAccount,
  from: string,
  to: string,
  rangeType: NaverRangeType,
) {
  try {
    const response = await getProductOrders(config, {
      from,
      to,
      rangeType,
      pageSize: 300,
      page: 1,
    });

    const contents = response.data?.contents || [];

    return contents.map(item => ({
      productOrderId: item.productOrderId,
      orderId: item.content.order.orderId,
      orderDate: item.content.order.orderDate,
      paymentDate: item.content.order.paymentDate,
      productName: item.content.productOrder.productName,
      productOption: item.content.productOrder.productOption || null,
      productId: item.content.productOrder.productId || null,
      quantity: item.content.productOrder.quantity,
      totalPaymentAmount: item.content.productOrder.totalPaymentAmount,
      productOrderStatus: item.content.productOrder.productOrderStatus,
      accountName: account.name,
      raw: item,
    }));
  } catch (err) {
    console.error(`[NaverSync][${account.name}] ${from} 조회 실패:`, err);
    return [];
  }
}

// ============================================================================
// 상품 매핑: product_mappings + 상품명 매칭
// ============================================================================

interface MappingEntry {
  product_id: string;
  external_product_name?: string;
  external_option_name?: string;
}

async function loadNaverMappings(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // 1. product_mappings 테이블에서 naver 매핑 로드
  const { data: mappings } = await getSupabase()
    .from('product_mappings')
    .select('product_id, external_product_name, external_option_name')
    .eq('marketplace', 'naver')
    .eq('is_active', true);

  mappings?.forEach((m: MappingEntry) => {
    if (m.external_product_name) {
      // 상품명 + 옵션명 키
      if (m.external_option_name) {
        map.set(`${m.external_product_name}|||${m.external_option_name}`, m.product_id);
      }
      // 상품명만 키
      map.set(m.external_product_name, m.product_id);
    }
  });

  // 2. products 테이블 이름 기반 매칭 (fallback)
  const { data: products } = await getSupabase()
    .from('products')
    .select('id, name')
    .eq('is_active', true);

  products?.forEach((p: { id: string; name: string }) => {
    // 정확한 이름 매칭 (아직 매핑 안 된 경우만)
    if (!map.has(p.name)) {
      map.set(p.name, p.id);
    }
  });

  return map;
}

function findProductId(
  mappingMap: Map<string, string>,
  productName: string,
  productOption: string | null,
): string | null {
  // 1. 상품명 + 옵션명으로 찾기
  if (productOption) {
    const keyWithOption = `${productName}|||${productOption}`;
    if (mappingMap.has(keyWithOption)) return mappingMap.get(keyWithOption)!;
  }
  // 2. 상품명만으로 찾기
  if (mappingMap.has(productName)) return mappingMap.get(productName)!;
  // 3. 매핑 없음
  return null;
}

// ============================================================================
// POST: 네이버 주문 동기화
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 파라미터 파싱
    let from: string;
    let to: string;
    let syncType: 'auto' | 'manual' = 'manual';

    try {
      const body = await request.json();
      syncType = body.type || 'manual';
      from = body.from || getKSTDaysAgo(7);
      to = body.to || getKSTDaysAgo(1);
    } catch {
      // Cron에서 body 없이 호출될 수 있음
      from = getKSTDaysAgo(7);
      to = getKSTDaysAgo(1);
      syncType = 'auto';
    }

    console.log(`[NaverSync] Starting - from: ${from}, to: ${to}, type: ${syncType}`);

    // 1. 네이버 계정 조회
    const accounts = getNaverAccounts();
    if (accounts.length === 0) {
      return NextResponse.json(
        { success: false, error: '네이버 계정이 설정되지 않았습니다.' },
        { status: 500 },
      );
    }

    // 2. 날짜 범위 분할 (24시간 단위)
    const dateRanges = splitDateRange(from, to);
    console.log(`[NaverSync] ${dateRanges.length} date ranges, ${accounts.length} account(s)`);

    // 3. 모든 계정의 주문 수집
    const allOrders: Awaited<ReturnType<typeof fetchOrdersForDateRange>> = [];

    for (const account of accounts) {
      const config = accountToConfig(account);
      const batchSize = 5;

      for (let i = 0; i < dateRanges.length; i += batchSize) {
        const batch = dateRanges.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(range =>
            fetchOrdersForDateRange(config, account, range.from, range.to, 'PAYED_DATETIME'),
          ),
        );
        allOrders.push(...batchResults.flat());

        // Rate limiting
        if (i + batchSize < dateRanges.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    // 중복 제거 (productOrderId 기준)
    const uniqueOrdersMap = new Map(allOrders.map(o => [o.productOrderId, o]));
    const orders = Array.from(uniqueOrdersMap.values());

    console.log(`[NaverSync] Fetched ${orders.length} unique orders`);

    if (orders.length === 0) {
      return NextResponse.json({
        success: true,
        message: '동기화할 주문이 없습니다.',
        synced: 0,
        updated: 0,
        skipped: 0,
        unmapped: 0,
      });
    }

    // 4. 상품 매핑 로드
    const mappingMap = await loadNaverMappings();

    // 5. Upsert (batch)
    let synced = 0;
    let updated = 0;
    let unmapped = 0;
    const errors: string[] = [];
    const unmappedProducts: Array<{ productName: string; productOption: string | null; count: number }> = [];
    const unmappedMap = new Map<string, { productName: string; productOption: string | null; count: number }>();

    // 배치 단위로 upsert (50개씩)
    const BATCH_SIZE = 50;
    for (let i = 0; i < orders.length; i += BATCH_SIZE) {
      const batch = orders.slice(i, i + BATCH_SIZE);

      const rows = batch.map(order => {
        const productId = findProductId(mappingMap, order.productName, order.productOption);

        if (!productId) {
          const key = `${order.productName}|||${order.productOption || ''}`;
          if (!unmappedMap.has(key)) {
            unmappedMap.set(key, { productName: order.productName, productOption: order.productOption, count: 0 });
          }
          unmappedMap.get(key)!.count += order.quantity;
        }

        return {
          product_order_id: order.productOrderId,
          order_id: order.orderId,
          payment_date: order.paymentDate || order.orderDate,
          product_id: productId,
          product_name: order.productName,
          product_option: order.productOption,
          quantity: order.quantity,
          total_payment_amount: order.totalPaymentAmount,
          channel_product_id: order.productId,
          status: order.productOrderStatus,
          account_name: order.accountName,
          raw_data: order.raw,
          synced_at: new Date().toISOString(),
        };
      });

      const { data, error } = await getSupabase()
        .from('naver_orders')
        .upsert(rows, {
          onConflict: 'product_order_id',
          ignoreDuplicates: false,
        })
        .select('product_order_id');

      if (error) {
        console.error(`[NaverSync] Upsert batch error:`, error.message);
        errors.push(error.message);
      } else {
        synced += data?.length || 0;
      }
    }

    // 매핑 안 된 상품 집계
    unmappedProducts.push(...Array.from(unmappedMap.values()));
    unmapped = unmappedProducts.reduce((sum, p) => sum + p.count, 0);

    // 6. 동기화 로그 기록
    try {
      await getSupabase().from('api_sync_logs').insert({
        channel: 'naver',
        sync_type: 'naver_orders',
        status: errors.length > 0 ? 'failed' : 'success',
        records_count: synced,
        error_message: errors.length > 0 ? errors.join('; ') : null,
        completed_at: new Date().toISOString(),
      });
    } catch (err: any) {
      // api_sync_logs 테이블이 없어도 무시
      console.warn('[NaverSync] Sync log insert failed:', err?.message);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[NaverSync] Done in ${elapsed}s - synced: ${synced}, unmapped: ${unmapped}`);

    return NextResponse.json({
      success: true,
      message: `동기화 완료: ${synced}건 upsert, 매핑 안 된 상품 ${unmappedProducts.length}종`,
      dateRange: { from, to },
      syncType,
      synced,
      totalFetched: orders.length,
      unmapped: unmappedProducts.length > 0 ? unmappedProducts : undefined,
      errors: errors.length > 0 ? errors : undefined,
      elapsed: `${elapsed}s`,
    });
  } catch (error) {
    console.error('[NaverSync] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

// ============================================================================
// GET: 동기화 상태 조회
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7', 10);

    // 최근 동기화된 주문 수
    const daysAgoDate = getKSTDaysAgo(days);
    const { count: totalOrders } = await getSupabase()
      .from('naver_orders')
      .select('*', { count: 'exact', head: true })
      .gte('payment_date', `${daysAgoDate}T00:00:00+09:00`);

    // 매핑 안 된 주문 수
    const { count: unmappedOrders } = await getSupabase()
      .from('naver_orders')
      .select('*', { count: 'exact', head: true })
      .is('product_id', null)
      .gte('payment_date', `${daysAgoDate}T00:00:00+09:00`);

    // 마지막 동기화 시각
    const { data: lastSync } = await getSupabase()
      .from('naver_orders')
      .select('synced_at')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      success: true,
      stats: {
        totalOrders: totalOrders || 0,
        unmappedOrders: unmappedOrders || 0,
        mappedOrders: (totalOrders || 0) - (unmappedOrders || 0),
        lastSyncedAt: lastSync?.synced_at || null,
        queryDays: days,
      },
    });
  } catch (error) {
    console.error('[NaverSync] GET Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
