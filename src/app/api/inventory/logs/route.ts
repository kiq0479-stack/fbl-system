import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

/**
 * GET /api/inventory/logs
 * 
 * 재고 변동 이력 조회
 * 
 * Query Parameters:
 * - inventory_id: 재고 ID (필수)
 * - days: 조회 기간 (기본: 7일)
 * - limit: 최대 개수 (기본: 50)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const inventoryId = searchParams.get('inventory_id');
    const days = parseInt(searchParams.get('days') || '7');
    const limit = parseInt(searchParams.get('limit') || '50');
    
    if (!inventoryId) {
      return NextResponse.json(
        { error: 'inventory_id is required' },
        { status: 400 }
      );
    }
    
    // 기간 계산 (KST 기준)
    const now = new Date();
    const fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    
    const { data, error } = await getSupabase()
      .from('inventory_logs')
      .select('*')
      .eq('inventory_id', inventoryId)
      .gte('created_at', fromDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Inventory logs query error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    // 변동 유형 한글 매핑
    const typeLabels: Record<string, string> = {
      in: '입고',
      out: '출고',
      adjust: '조정',
      transfer: '이동',
    };
    
    // 참조 유형 한글 매핑
    const refTypeLabels: Record<string, string> = {
      naver_order: '네이버 주문',
      barcode_scan: '바코드 스캔',
      manual: '수동 조정',
      coupang_sync: '쿠팡 동기화',
    };
    
    const logs = (data || []).map(log => ({
      ...log,
      change_type_label: typeLabels[log.change_type] || log.change_type,
      reference_type_label: log.reference_type ? (refTypeLabels[log.reference_type] || log.reference_type) : null,
    }));
    
    return NextResponse.json({
      success: true,
      logs,
      count: logs.length,
      period: {
        from: fromDate.toISOString(),
        to: now.toISOString(),
        days,
      },
    });
  } catch (error) {
    console.error('Inventory logs API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
