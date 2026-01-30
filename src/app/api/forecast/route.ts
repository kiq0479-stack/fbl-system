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

// Supabase 1000행 제한 우회: 페이지네이션으로 전체 데이터 fetch
async function fetchAll<T = any>(
  queryFn: (from: number, to: number) => any,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryFn(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/**
 * 발주 수요 예측 API
 * 
 * 판매량 데이터 소스:
 * 1. sales - 판매 내역 테이블 (채널별 판매 기록)
 * 2. sales_daily - 일별 판매 집계 테이블
 * 3. inventory_logs (change_type='out') - 네이버 주문 출고, 바코드 스캔 출고
 * 4. coupang_revenues - 쿠팡 매출 데이터 (vendor_item_id로 매핑)
 * 5. coupang_order_items - 쿠팡 주문 (vendor_item_id로 매핑)
 * 
 * 계산 항목:
 * - 7/30/60/90/120일 판매량
 * - 60일/90일/120일 필요재고 (현재재고 - 예상판매량)
 * - 쿠팡 40일 필요재고 (40일 판매량 - 쿠팡센터 재고)
 * - 품절 위험 표시
 */

interface ForecastItem {
  product_id: string;
  sku: string;
  name: string;
  category: string;
  warehouse_qty: number;
  coupang_qty: number;
  total_qty: number;
  sales_7d: number;
  sales_30d: number;
  sales_40d: number;
  sales_60d: number;
  sales_90d: number;
  sales_120d: number;
  need_60d: number;
  need_90d: number;
  need_120d: number;
  coupang_need_40d: number;
  stockout_risk: boolean;
}

// KST 기준 날짜 계산
function getKSTDate(daysAgo: number = 0): Date {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  kstNow.setDate(kstNow.getDate() - daysAgo);
  kstNow.setUTCHours(0, 0, 0, 0);
  return kstNow;
}

// 일수 계산
function getDaysAgo(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
}

type SalesBucket = { d7: number; d30: number; d40: number; d60: number; d90: number; d120: number };
const ZERO_BUCKET = (): SalesBucket => ({ d7: 0, d30: 0, d40: 0, d60: 0, d90: 0, d120: 0 });

type SourceKey = 'naver' | 'coupang_seller' | 'coupang_rocket' | 'other';

// 판매량 누적 헬퍼 (소스별 추적)
function addSales(
  salesMap: Map<string, SalesBucket>,
  productId: string,
  daysAgo: number,
  qty: number
) {
  if (!salesMap.has(productId)) salesMap.set(productId, ZERO_BUCKET());
  const sales = salesMap.get(productId)!;
  if (daysAgo <= 7) sales.d7 += qty;
  if (daysAgo <= 30) sales.d30 += qty;
  if (daysAgo <= 40) sales.d40 += qty;
  if (daysAgo <= 60) sales.d60 += qty;
  if (daysAgo <= 90) sales.d90 += qty;
  if (daysAgo <= 120) sales.d120 += qty;
}

function addSalesBySource(
  sourceMap: Map<string, Record<SourceKey, SalesBucket>>,
  productId: string,
  source: SourceKey,
  daysAgo: number,
  qty: number
) {
  if (!sourceMap.has(productId)) {
    sourceMap.set(productId, { naver: ZERO_BUCKET(), coupang_seller: ZERO_BUCKET(), coupang_rocket: ZERO_BUCKET(), other: ZERO_BUCKET() });
  }
  const bucket = sourceMap.get(productId)![source];
  if (daysAgo <= 7) bucket.d7 += qty;
  if (daysAgo <= 30) bucket.d30 += qty;
  if (daysAgo <= 40) bucket.d40 += qty;
  if (daysAgo <= 60) bucket.d60 += qty;
  if (daysAgo <= 90) bucket.d90 += qty;
  if (daysAgo <= 120) bucket.d120 += qty;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const onlyRisk = searchParams.get('only_risk') === 'true';

    // 1. 모든 활성 상품 조회
    let productsQuery = getSupabase()
      .from('products')
      .select('id, sku, name, category, external_sku')
      .eq('is_active', true);
    
    if (category && category !== 'all') {
      productsQuery = productsQuery.eq('category', category);
    }

    const { data: products, error: productsError } = await productsQuery;
    
    if (productsError) {
      console.error('Products query error:', productsError);
      return NextResponse.json({ error: productsError.message }, { status: 500 });
    }

    if (!products || products.length === 0) {
      return NextResponse.json({ 
        success: true, 
        items: [],
        summary: { total: 0, at_risk: 0 }
      });
    }

    // 2. 현재 재고 조회 (창고 + 쿠팡)
    const { data: inventoryData, error: inventoryError } = await getSupabase()
      .from('inventory')
      .select('product_id, location, quantity')
      .in('product_id', products.map(p => p.id))
      .in('location', ['warehouse', 'coupang']);

    if (inventoryError) {
      console.error('Inventory query error:', inventoryError);
      return NextResponse.json({ error: inventoryError.message }, { status: 500 });
    }

    // 재고 맵 생성
    const inventoryMap = new Map<string, { warehouse: number; coupang: number }>();
    inventoryData?.forEach(inv => {
      if (!inventoryMap.has(inv.product_id)) {
        inventoryMap.set(inv.product_id, { warehouse: 0, coupang: 0 });
      }
      const entry = inventoryMap.get(inv.product_id)!;
      if (inv.location === 'warehouse') {
        entry.warehouse = inv.quantity;
      } else if (inv.location === 'coupang') {
        entry.coupang = inv.quantity;
      }
    });

    // 3. SKU -> product_id 매핑 (3단계)
    // 1단계: product_mappings 테이블 (external_option_id = vendorItemId)
    // 2단계: products.sku 직접 매칭
    // 3단계: prefix 매칭 (앞 9자리)
    
    const skuToProduct = new Map<string, string>();
    const skuPrefixToProduct = new Map<string, string>();
    const mappingToProduct = new Map<string, string>(); // product_mappings 기반
    
    // 3-1. product_mappings에서 vendorItemId -> product_id 매핑 로드
    const { data: productMappings } = await getSupabase()
      .from('product_mappings')
      .select('product_id, external_option_id')
      .eq('is_active', true)
      .eq('marketplace', 'coupang')
      .not('external_option_id', 'is', null);
    
    productMappings?.forEach(m => {
      if (m.external_option_id) {
        mappingToProduct.set(m.external_option_id.toString(), m.product_id);
      }
    });
    
    // 3-2. products.sku 및 external_sku 매핑
    products.forEach(p => {
      skuToProduct.set(p.sku, p.id);
      if (p.external_sku) {
        skuToProduct.set(p.external_sku, p.id);
      }
      // 앞 9자리 prefix 매핑 (쿠팡 옵션별 vendorItemId 근사 매칭)
      if (p.sku && p.sku.length >= 9) {
        skuPrefixToProduct.set(p.sku.substring(0, 9), p.id);
      }
    });
    
    // vendor_item_id로 product_id 찾기 (매핑 테이블 → SKU 정확 → prefix)
    const findProductByVendorItemId = (vendorItemId: string | number): string | undefined => {
      const vid = vendorItemId?.toString();
      if (!vid) return undefined;
      // 1. product_mappings 테이블 (가장 정확)
      if (mappingToProduct.has(vid)) return mappingToProduct.get(vid);
      // 2. SKU 정확 매칭
      if (skuToProduct.has(vid)) return skuToProduct.get(vid);
      // 3. 앞 9자리 prefix 매칭
      if (vid.length >= 9) {
        const prefix = vid.substring(0, 9);
        if (skuPrefixToProduct.has(prefix)) return skuPrefixToProduct.get(prefix);
      }
      return undefined;
    };

    const now = getKSTDate(0);
    const date120dAgo = getKSTDate(120);
    const salesByProduct = new Map<string, SalesBucket>();
    const salesBySource = new Map<string, Record<SourceKey, SalesBucket>>();

    // 중복 방지용: sales 테이블에서 가져온 product_id 세트 (sales_daily와 중복 방지)
    const salesProductIds = new Set<string>();

    // ====================================================================
    // 4-0a. sales 테이블에서 판매 내역 조회 (모든 채널)
    // ====================================================================
    const { data: salesRecords, error: salesError } = await getSupabase()
      .from('sales')
      .select('product_id, quantity, sold_at')
      .gte('sold_at', date120dAgo.toISOString());

    if (salesError) {
      console.error('Sales query error:', salesError);
    } else {
      salesRecords?.forEach((sale: any) => {
        const productId = sale.product_id;
        if (!productId) return;

        salesProductIds.add(productId);
        const saleDate = new Date(sale.sold_at);
        const daysAgo = getDaysAgo(saleDate, now);
        const qty = sale.quantity || 0;

        addSales(salesByProduct, productId, daysAgo, qty);
      });
    }

    // ====================================================================
    // 4-0b. sales_daily 테이블에서 일별 집계 조회 (sales에 없는 상품만)
    // ====================================================================
    const { data: salesDailyRecords, error: salesDailyError } = await getSupabase()
      .from('sales_daily')
      .select('product_id, sale_date, total_qty')
      .gte('sale_date', date120dAgo.toISOString().split('T')[0]);

    if (salesDailyError) {
      console.error('Sales daily query error:', salesDailyError);
    } else {
      salesDailyRecords?.forEach((daily: any) => {
        const productId = daily.product_id;
        if (!productId) return;
        // sales 테이블에서 이미 가져온 상품은 중복 방지
        if (salesProductIds.has(productId)) return;

        const saleDate = new Date(daily.sale_date);
        const daysAgo = getDaysAgo(saleDate, now);
        const qty = daily.total_qty || 0;

        addSales(salesByProduct, productId, daysAgo, qty);
      });
    }

    // ====================================================================
    // 4-1. inventory_logs에서 출고 기록 조회 (네이버 주문, 바코드 스캔 등)
    // ====================================================================
    const { data: inventoryLogs, error: logsError } = await getSupabase()
      .from('inventory_logs')
      .select(`
        inventory_id,
        change_qty,
        created_at,
        inventory!inner(product_id, location)
      `)
      .eq('change_type', 'out')
      .gte('created_at', date120dAgo.toISOString());

    if (logsError) {
      console.error('Inventory logs query error:', logsError);
    } else {
      inventoryLogs?.forEach((log: any) => {
        const productId = log.inventory?.product_id;
        if (!productId) return;

        const logDate = new Date(log.created_at);
        const daysAgo = getDaysAgo(logDate, now);
        const qty = Math.abs(log.change_qty);

        addSales(salesByProduct, productId, daysAgo, qty);
        addSalesBySource(salesBySource, productId, 'naver', daysAgo, qty);
      });
    }

    // ====================================================================
    // 4-2. coupang_revenues에서 쿠팡 매출 데이터 조회
    // 실제 DB 구조: id, order_id, vendor_id, sale_type, sale_date, recognition_date, settlement_date, items(JSON)
    // ====================================================================
    const coupangRevenues = await fetchAll<any>(
      (from, to) => getSupabase()
        .from('coupang_revenues')
        .select('sale_date, items')
        .gte('sale_date', date120dAgo.toISOString().split('T')[0])
        .range(from, to)
    );

    coupangRevenues.forEach((rev: any) => {
      const saleDate = new Date(rev.sale_date);
      const daysAgo = getDaysAgo(saleDate, now);
      
      // items는 JSON 배열: [{vendorItemId, quantity, ...}, ...]
      const items = rev.items || [];
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          const vendorItemId = item.vendorItemId || item.vendor_item_id;
          const qty = item.quantity || item.salesQuantity || 1;
          
          const productId = findProductByVendorItemId(vendorItemId);
          if (!productId) return;
          
          addSales(salesByProduct, productId, daysAgo, qty);
          addSalesBySource(salesBySource, productId, 'coupang_rocket', daysAgo, qty);
        });
      }
    });

    // ====================================================================
    // 4-3. coupang_order_items에서 쿠팡 주문 조회 (페이지네이션)
    // ====================================================================
    const coupangOrderItems = await fetchAll<any>(
      (from, to) => getSupabase()
        .from('coupang_order_items')
        .select(`
          vendor_item_id,
          shipping_count,
          external_vendor_sku_code,
          created_at,
          coupang_orders!inner(ordered_at)
        `)
        .gte('created_at', date120dAgo.toISOString())
        .range(from, to)
    );
    const coupangItemsError = null;

    if (coupangItemsError) {
      console.error('Coupang order items query error:', coupangItemsError);
    } else {
      coupangOrderItems?.forEach((item: any) => {
        let productId = findProductByVendorItemId(item.vendor_item_id);
        if (!productId && item.external_vendor_sku_code) {
          productId = skuToProduct.get(item.external_vendor_sku_code);
        }
        if (!productId) return;

        const orderDate = new Date(item.coupang_orders?.ordered_at || item.created_at);
        const daysAgo = getDaysAgo(orderDate, now);
        const qty = item.shipping_count || 0;

        addSales(salesByProduct, productId, daysAgo, qty);
        addSalesBySource(salesBySource, productId, 'coupang_seller', daysAgo, qty);
      });
    }

    // ====================================================================
    // 5. 발주 예측 데이터 생성
    // ====================================================================
    const forecastItems: ForecastItem[] = products.map(product => {
      const inv = inventoryMap.get(product.id) || { warehouse: 0, coupang: 0 };
      const sales = salesByProduct.get(product.id) || { d7: 0, d30: 0, d40: 0, d60: 0, d90: 0, d120: 0 };
      
      const sourceSales = salesBySource.get(product.id) || { naver: ZERO_BUCKET(), coupang_seller: ZERO_BUCKET(), coupang_rocket: ZERO_BUCKET(), other: ZERO_BUCKET() };
      const warehouseQty = inv.warehouse;
      const coupangQty = inv.coupang;
      const totalQty = warehouseQty + coupangQty;

      // 필요재고 계산: 현재 총재고 - 예상 판매량
      const need60d = totalQty - sales.d60;
      const need90d = totalQty - sales.d90;
      const need120d = totalQty - sales.d120;

      // 쿠팡 40일 필요재고: 40일 판매량 - 현재 쿠팡 센터 재고
      const coupangNeed40d = sales.d40 - coupangQty;

      // 품절 위험: 60일 또는 90일 필요재고가 마이너스
      const stockoutRisk = need60d < 0 || need90d < 0;

      return {
        product_id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category || '미분류',
        warehouse_qty: warehouseQty,
        coupang_qty: coupangQty,
        total_qty: totalQty,
        sales_7d: sales.d7,
        sales_30d: sales.d30,
        sales_40d: sales.d40,
        sales_60d: sales.d60,
        sales_90d: sales.d90,
        sales_120d: sales.d120,
        need_60d: need60d,
        need_90d: need90d,
        need_120d: need120d,
        coupang_need_40d: coupangNeed40d,
        stockout_risk: stockoutRisk,
        by_source: {
          naver: { d7: sourceSales.naver.d7, d30: sourceSales.naver.d30, d60: sourceSales.naver.d60, d120: sourceSales.naver.d120 },
          coupang_seller: { d7: sourceSales.coupang_seller.d7, d30: sourceSales.coupang_seller.d30, d60: sourceSales.coupang_seller.d60, d120: sourceSales.coupang_seller.d120 },
          coupang_rocket: { d7: sourceSales.coupang_rocket.d7, d30: sourceSales.coupang_rocket.d30, d60: sourceSales.coupang_rocket.d60, d120: sourceSales.coupang_rocket.d120 },
        },
      };
    });

    // 품절 위험만 필터
    let result = forecastItems;
    if (onlyRisk) {
      result = forecastItems.filter(item => item.stockout_risk);
    }

    // 카테고리별 정렬 (품절 위험 우선)
    result.sort((a, b) => {
      if (a.stockout_risk !== b.stockout_risk) {
        return a.stockout_risk ? -1 : 1;
      }
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category, 'ko');
      }
      return a.name.localeCompare(b.name, 'ko');
    });

    // 6. 카테고리 목록 조회
    const { data: categories } = await getSupabase()
      .from('products')
      .select('category')
      .eq('is_active', true);
    
    const uniqueCategories = [...new Set(categories?.map(c => c.category).filter(Boolean))].sort();

    return NextResponse.json({
      success: true,
      items: result,
      categories: uniqueCategories,
      summary: {
        total: result.length,
        at_risk: result.filter(item => item.stockout_risk).length,
      },
      generated_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Forecast API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
