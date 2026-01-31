/**
 * ============================================================================
 * 판매량 집계 API (DB 기반)
 * ============================================================================
 *
 * Supabase DB에 동기화된 데이터를 기반으로 기간별 판매량을 집계합니다.
 * 기존 쿠팡 API 실시간 호출 방식에서 DB 쿼리 방식으로 전환. (Vercel 타임아웃 해결)
 *
 * ## 데이터 소스
 * 1. 쿠팡 판매자배송 (coupang_seller) — coupang_orders + coupang_order_items
 * 2. 쿠팡 로켓그로스 (coupang_rocket) — coupang_revenues
 * 3. 네이버 스마트스토어 (naver) — TODO: 추후 추가
 *
 * @route GET /api/sales/summary
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 30;

// ============================================================================
// Supabase 초기화
// ============================================================================

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Supabase environment variables are not configured');
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// ============================================================================
// 타입 정의
// ============================================================================

interface SalesSummaryItem {
  vendorItemId: number;
  productName: string;
  sku: string | null;
  sales: {
    d7: number;
    d30: number;
    d60: number;
    d120: number;
  };
  source: string;
}

type PeriodKey = 'd7' | 'd30' | 'd60' | 'd120';

const PERIODS: { key: PeriodKey; days: number }[] = [
  { key: 'd7', days: 7 },
  { key: 'd30', days: 30 },
  { key: 'd60', days: 60 },
  { key: 'd120', days: 120 },
];

/**
 * N일 전 날짜를 ISO 문자열로 반환
 */
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ============================================================================
// 판매자배송: coupang_orders + coupang_order_items
// ============================================================================

async function fetchSellerSales(): Promise<SalesSummaryItem[]> {
  const supabase = getSupabase();
  const cutoff = daysAgoISO(120);

  // 1) 120일 이내 주문 ID + ordered_at 조회
  const { data: orders, error: orderErr } = await supabase
    .from('coupang_orders')
    .select('id, ordered_at')
    .neq('orderer_name', '(로켓그로스)')
    .gte('ordered_at', cutoff);

  if (orderErr) {
    console.error('[SalesSummary] 판매자배송 주문 조회 실패:', orderErr.message);
    return [];
  }
  if (!orders || orders.length === 0) return [];

  // ordered_at 룩업 맵
  const orderDateMap = new Map<string, string>();
  for (const o of orders) {
    orderDateMap.set(o.id, o.ordered_at);
  }

  // 2) 해당 주문들의 아이템 조회 (500건씩 chunk)
  const orderIds = orders.map((o: { id: string }) => o.id);
  const CHUNK = 500;
  const allItems: Array<{
    vendor_item_id: number;
    vendor_item_name: string;
    shipping_count: number;
    external_vendor_sku_code: string | null;
    coupang_order_id: string;
  }> = [];

  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const chunk = orderIds.slice(i, i + CHUNK);
    const { data: items, error: itemErr } = await supabase
      .from('coupang_order_items')
      .select('vendor_item_id, vendor_item_name, shipping_count, external_vendor_sku_code, coupang_order_id')
      .in('coupang_order_id', chunk);

    if (itemErr) {
      console.error('[SalesSummary] 판매자배송 아이템 조회 실패:', itemErr.message);
      continue;
    }
    if (items) allItems.push(...items);
  }

  if (allItems.length === 0) return [];

  // vendor_item_id별 기간별 집계
  const map = new Map<
    number,
    { name: string; sku: string | null; sales: Record<PeriodKey, number> }
  >();

  const now = Date.now();

  for (const row of allItems) {
    const vid = row.vendor_item_id;
    const orderedAt = orderDateMap.get(row.coupang_order_id);
    if (!orderedAt) continue;

    const daysAgo = (now - new Date(orderedAt).getTime()) / 86_400_000;
    const qty = row.shipping_count ?? 0;

    if (!map.has(vid)) {
      map.set(vid, {
        name: row.vendor_item_name ?? '',
        sku: row.external_vendor_sku_code ?? null,
        sales: { d7: 0, d30: 0, d60: 0, d120: 0 },
      });
    }

    const entry = map.get(vid)!;
    if (row.vendor_item_name) entry.name = row.vendor_item_name;
    if (row.external_vendor_sku_code) entry.sku = row.external_vendor_sku_code;

    for (const { key, days } of PERIODS) {
      if (daysAgo <= days) {
        entry.sales[key] += qty;
      }
    }
  }

  const results: SalesSummaryItem[] = [];
  for (const [vid, entry] of map) {
    results.push({
      vendorItemId: vid,
      productName: entry.name || `판매자배송 상품 (${vid})`,
      sku: entry.sku,
      sales: entry.sales,
      source: 'coupang_seller',
    });
  }

  console.log(`[SalesSummary] 판매자배송: ${results.length}개 상품, 원본 ${allItems.length}건`);
  return results;
}

// ============================================================================
// 로켓그로스: coupang_revenues
// ============================================================================

async function fetchRocketSales(): Promise<SalesSummaryItem[]> {
  const supabase = getSupabase();
  const cutoff120 = daysAgoISO(120).split('T')[0]; // YYYY-MM-DD

  // coupang_revenues: items는 JSONB 배열, sale_date는 YYYY-MM-DD 문자열
  const { data, error } = await supabase
    .from('coupang_revenues')
    .select('items, sale_date')
    .gte('sale_date', cutoff120);

  if (error) {
    console.error('[SalesSummary] 로켓그로스 조회 실패:', error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  // vendor_item_id별 기간별 집계
  const map = new Map<
    number,
    { name: string; sales: Record<PeriodKey, number> }
  >();

  const now = Date.now();
  let rawCount = 0;

  for (const row of data) {
    if (!row.sale_date || !row.items) continue;

    const saleDate = new Date(row.sale_date + 'T00:00:00Z');
    const daysAgo = (now - saleDate.getTime()) / 86_400_000;

    // items: JSONB 배열 [{vendorItemId, productName, quantity, ...}, ...]
    const items = Array.isArray(row.items) ? row.items : [];

    for (const item of items) {
      const vid = Number(item.vendorItemId);
      if (!vid) continue;

      const qty = item.quantity ?? 0;
      rawCount++;

      if (!map.has(vid)) {
        map.set(vid, {
          name: item.productName ?? '',
          sales: { d7: 0, d30: 0, d60: 0, d120: 0 },
        });
      }

      const entry = map.get(vid)!;
      if (item.productName) entry.name = item.productName;

      for (const { key, days } of PERIODS) {
        if (daysAgo <= days) {
          entry.sales[key] += qty;
        }
      }
    }
  }

  const results: SalesSummaryItem[] = [];
  for (const [vid, entry] of map) {
    results.push({
      vendorItemId: vid,
      productName: entry.name || `로켓그로스 상품 (${vid})`,
      sku: null,
      sales: entry.sales,
      source: 'coupang_rocket',
    });
  }

  console.log(`[SalesSummary] 로켓그로스: ${results.length}개 상품, 원본 ${rawCount}건`);
  return results;
}

// ============================================================================
// API Route Handler
// ============================================================================

export async function GET(_request: NextRequest) {
  try {
    const startTime = Date.now();

    // 병렬로 두 소스 조회
    const [sellerItems, rocketItems] = await Promise.all([
      fetchSellerSales(),
      fetchRocketSales(),
    ]);

    // TODO: 네이버 스마트스토어 판매량 추가
    // const naverItems = await fetchNaverSales();

    const allItems = [...sellerItems, ...rocketItems];

    // d30 기준 내림차순 정렬
    allItems.sort((a, b) => b.sales.d30 - a.sales.d30);

    const elapsed = Date.now() - startTime;
    console.log(`[SalesSummary] 집계 완료: ${allItems.length}개 상품, ${elapsed}ms`);

    return NextResponse.json({
      success: true,
      data: allItems,
      sources: {
        coupang_rocket: rocketItems.length,
        coupang_seller: sellerItems.length,
      },
      updatedAt: new Date().toISOString(),
      elapsedMs: elapsed,
    });
  } catch (error) {
    console.error('[SalesSummary] API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
