import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  getProductOrders, 
  getNaverAccounts, 
  accountToConfig,
} from '@/lib/naver';

// Lazy 초기화 (빌드 타임에 throw 방지)
let _supabase: SupabaseClient | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

interface SyncResult {
  orderId: string;
  productName: string;
  productOption?: string | null;
  quantity: number;
  status: 'synced' | 'skipped' | 'failed';
  reason?: string;
  productId?: string;
}

// 매핑 키 생성 (상품명 + 옵션명)
function getMappingKey(productName: string, optionName?: string | null): string {
  if (optionName) {
    return `${productName}|||${optionName}`;
  }
  return productName;
}

// 동기화 기준 시간 (오전 6시)
const SYNC_HOUR = 6;

/**
 * 재고 동기화 조회 범위 계산 (KST 기준)
 * 
 * 예: 1월27일 오전 6시에 실행되면
 * - from: 1월26일 06:00:00 KST
 * - to: 1월27일 05:59:59 KST
 * 
 * @returns { from, to } ISO-8601 형식 (KST 타임존)
 */
function getSyncDateRange(): { from: string; to: string; syncLabel: string } {
  const now = new Date();
  
  // 현재 KST 시간 계산
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  
  // 오늘 오전 6시 (KST)
  const todaySyncTime = new Date(kstNow);
  todaySyncTime.setUTCHours(SYNC_HOUR - 9, 0, 0, 0); // KST 6시 = UTC -3시 (전날 21시)
  
  // 어제 오전 6시 (KST)
  const yesterdaySyncTime = new Date(todaySyncTime);
  yesterdaySyncTime.setDate(yesterdaySyncTime.getDate() - 1);
  
  // from: 어제 06:00:00 KST
  const fromDate = new Date(yesterdaySyncTime);
  
  // to: 오늘 05:59:59.999 KST (= 어제 06:00 + 24시간 - 1ms)
  const toDate = new Date(todaySyncTime.getTime() - 1);
  
  // ISO-8601 with KST timezone
  const formatKST = (date: Date): string => {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    const s = String(date.getUTCSeconds()).padStart(2, '0');
    const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${y}-${m}-${d}T${h}:${min}:${s}.${ms}+09:00`;
  };
  
  // 라벨용 날짜 (어제 날짜)
  const labelDate = new Date(fromDate);
  const syncLabel = `${labelDate.getUTCFullYear()}-${String(labelDate.getUTCMonth() + 1).padStart(2, '0')}-${String(labelDate.getUTCDate()).padStart(2, '0')}`;
  
  return {
    from: formatKST(fromDate),
    to: formatKST(toDate),
    syncLabel,
  };
}

// POST: 네이버 주문 → 재고 동기화
// Cron Job에서 호출되거나 수동으로 호출 가능
export async function POST(request: NextRequest) {
  const startTime = new Date();
  let syncLogId: string | null = null;
  
  try {
    // 요청 파라미터 파싱
    let fromDate: string;
    let toDate: string;
    let syncLabel: string;
    let syncType: 'auto' | 'manual' = 'manual';
    
    try {
      const body = await request.json();
      syncType = body.type || 'manual';
      
      if (body.from && body.to) {
        // 수동으로 범위 지정한 경우
        fromDate = body.from;
        toDate = body.to;
        syncLabel = body.date || 'manual';
      } else {
        // 기본: 어제 06:00 ~ 오늘 05:59
        const range = getSyncDateRange();
        fromDate = range.from;
        toDate = range.to;
        syncLabel = range.syncLabel;
      }
    } catch {
      // Cron Job에서는 body가 없을 수 있음
      const range = getSyncDateRange();
      fromDate = range.from;
      toDate = range.to;
      syncLabel = range.syncLabel;
      syncType = 'auto';
    }
    
    console.log(`[Naver Inventory Sync] Starting sync - Range: ${fromDate} ~ ${toDate}, type: ${syncType}`);
    
    // 동기화 로그 시작 기록
    const { data: logData, error: logError } = await getSupabase()
      .from('inventory_sync_logs')
      .insert({
        marketplace: 'naver',
        sync_type: syncType,
        sync_date: syncLabel,
        status: 'success', // 일단 성공으로 시작, 실패시 업데이트
        started_at: startTime.toISOString(),
      })
      .select('id')
      .single();
    
    if (logData) {
      syncLogId = logData.id;
    }
    
    // 1. 네이버 계정 조회
    const accounts = getNaverAccounts();
    if (accounts.length === 0) {
      throw new Error('네이버 계정이 설정되지 않았습니다.');
    }
    
    // 2. 해당 범위의 주문 조회 (결제일 기준)
    const config = accountToConfig(accounts[0]);
    
    const ordersResponse = await getProductOrders(config, {
      from: fromDate,
      to: toDate,
      rangeType: 'PAYED_DATETIME',
      pageSize: 300,  // 최대 300개
      page: 1,
    });
    
    if (!ordersResponse || !ordersResponse.data) {
      throw new Error('주문 조회 실패');
    }
    
    const orders = ordersResponse.data.contents || [];
    console.log(`[Naver Inventory Sync] Found ${orders.length} orders`);
    
    // 3. 매핑 테이블 조회
    const { data: mappings } = await getSupabase()
      .from('product_mappings')
      .select('*, products(id, name, sku)')
      .eq('marketplace', 'naver')
      .eq('is_active', true);
    
    // 매핑을 (상품명 + 옵션명) 키로 인덱싱
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mappingByKey = new Map<string, any>();
    mappings?.forEach((m: any) => {
      if (m.external_product_name) {
        const key = getMappingKey(m.external_product_name, m.external_option_name);
        mappingByKey.set(key, m);
      }
    });
    
    // 4. 각 주문 처리
    const results: SyncResult[] = [];
    let syncedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let totalQtyChanged = 0;
    
    for (const order of orders) {
      const productOrderId = order.productOrderId;
      const productOrder = order.content?.productOrder;
      const productName = productOrder?.productName || '';
      const productOption = productOrder?.productOption || null;  // 옵션명 추출
      const quantity = productOrder?.quantity || 1;
      
      // 이미 처리된 주문인지 확인
      const { data: existingLog } = await getSupabase()
        .from('inventory_logs')
        .select('id')
        .eq('reference_type', 'naver_order')
        .eq('reference_id', productOrderId)
        .single();
      
      if (existingLog) {
        results.push({
          orderId: productOrderId,
          productName,
          productOption,
          quantity,
          status: 'skipped',
          reason: '이미 처리된 주문',
        });
        skippedCount++;
        continue;
      }
      
      // 매핑 찾기 (상품명 + 옵션명으로 먼저 시도, 없으면 상품명만으로 시도)
      const keyWithOption = getMappingKey(productName, productOption);
      const keyWithoutOption = getMappingKey(productName, null);
      const mapping = mappingByKey.get(keyWithOption) || mappingByKey.get(keyWithoutOption);
      
      if (!mapping || !mapping.products) {
        results.push({
          orderId: productOrderId,
          productName,
          productOption,
          quantity,
          status: 'failed',
          reason: productOption 
            ? `매핑 없음 (상품명+옵션명: ${productName} / ${productOption})`
            : `매핑 없음 (상품명: ${productName})`,
        });
        failedCount++;
        continue;
      }
      
      const productId = mapping.product_id;
      
      // warehouse 재고 조회
      const { data: inventory } = await getSupabase()
        .from('inventory')
        .select('id, quantity')
        .eq('product_id', productId)
        .eq('location', 'warehouse')
        .single();
      
      if (!inventory) {
        results.push({
          orderId: productOrderId,
          productName,
          productOption,
          quantity,
          status: 'failed',
          reason: '창고 재고 레코드 없음',
          productId,
        });
        failedCount++;
        continue;
      }
      
      // 재고 차감
      const newQuantity = inventory.quantity - quantity;
      
      const { error: updateError } = await getSupabase()
        .from('inventory')
        .update({ 
          quantity: newQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inventory.id);
      
      if (updateError) {
        results.push({
          orderId: productOrderId,
          productName,
          productOption,
          quantity,
          status: 'failed',
          reason: `재고 업데이트 실패: ${updateError.message}`,
          productId,
        });
        failedCount++;
        continue;
      }
      
      // 재고 변동 로그 기록
      await getSupabase()
        .from('inventory_logs')
        .insert({
          inventory_id: inventory.id,
          change_type: 'out',
          change_qty: -quantity,
          reason: `네이버 주문 #${productOrderId}`,
          reference_type: 'naver_order',
          reference_id: productOrderId,
        });
      
      results.push({
        orderId: productOrderId,
        productName,
        productOption,
        quantity,
        status: 'synced',
        productId,
      });
      syncedCount++;
      totalQtyChanged += quantity;
    }
    
    // 5. 동기화 로그 완료 기록
    if (syncLogId) {
      await getSupabase()
        .from('inventory_sync_logs')
        .update({
          orders_count: orders.length,
          synced_count: syncedCount,
          skipped_count: skippedCount,
          failed_count: failedCount,
          total_qty_changed: totalQtyChanged,
          status: failedCount > 0 && syncedCount === 0 ? 'failed' : 'success',
          details: { results },
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLogId);
    }
    
    console.log(`[Naver Inventory Sync] Completed - Synced: ${syncedCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);
    
    return NextResponse.json({
      success: true,
      syncDate: syncLabel,
      syncRange: { from: fromDate, to: toDate },
      syncType,
      summary: {
        total: orders.length,
        synced: syncedCount,
        skipped: skippedCount,
        failed: failedCount,
        totalQtyChanged,
      },
      results,
    });
    
  } catch (error) {
    console.error('[Naver Inventory Sync] Error:', error);
    
    // 에러 시 로그 업데이트
    if (syncLogId) {
      await getSupabase()
        .from('inventory_sync_logs')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLogId);
    }
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '동기화 중 오류 발생',
    }, { status: 500 });
  }
}

// GET: 동기화 이력 조회
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');
    
    const { data, error } = await getSupabase()
      .from('inventory_sync_logs')
      .select('*')
      .eq('marketplace', 'naver')
      .order('started_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ logs: data || [] });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
