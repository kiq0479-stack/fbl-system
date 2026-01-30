import { NextRequest, NextResponse } from 'next/server';
import { getRocketGrowthInventory, getRocketGrowthOrders, getCoupangAccounts, CoupangAccount, CoupangConfig } from '@/lib/coupang';
import { createClient } from '@/lib/supabase/server';

// 최대 페이지 수 제한 (무한 루프 방지)
const MAX_INVENTORY_PAGES = 50;
const MAX_ORDER_PAGES = 10;

/** 쿠팡 API 최대 조회 기간 (일) */
const COUPANG_MAX_QUERY_DAYS = 30;

/** API 호출 간 딜레이 (ms) - 분당 50회 제한 대응 */
const API_DELAY_MS = 300;

// 날짜 계산 헬퍼
function getDateString(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

function formatDateToYYYYMMDD(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 긴 기간을 30일 이하 구간으로 분할
 */
function splitDateRange(totalDays: number): Array<{ from: string; to: string }> {
  const ranges: Array<{ from: string; to: string }> = [];
  let remaining = totalDays;
  let endOffset = 0;

  while (remaining > 0) {
    const chunkDays = Math.min(remaining, COUPANG_MAX_QUERY_DAYS);
    const startOffset = endOffset + chunkDays;
    ranges.push({
      from: getDateString(startOffset),
      to: getDateString(endOffset),
    });
    endOffset = startOffset;
    remaining -= chunkDays;
  }

  return ranges;
}

/**
 * 단일 기간의 로켓그로스 주문 전체 수집 (페이지네이션 포함)
 */
async function fetchAllOrdersForPeriod(
  config: CoupangConfig,
  vendorId: string,
  paidDateFrom: string,
  paidDateTo: string
): Promise<any[]> {
  const allOrders: any[] = [];
  let nextToken: string | undefined;
  let pages = 0;

  try {
    do {
      const response = await getRocketGrowthOrders(config, {
        vendorId,
        paidDateFrom,
        paidDateTo,
        nextToken,
      });
      allOrders.push(...(response.data || []));
      nextToken = response.nextToken;
      pages++;
      if (pages >= MAX_ORDER_PAGES) break;
      if (nextToken) await sleep(API_DELAY_MS);
    } while (nextToken);
  } catch (err) {
    console.error(`[StockSummary] Order fetch error (${paidDateFrom}~${paidDateTo}):`, err);
  }

  return allOrders;
}

// 단일 계정의 재고/주문 데이터 가져오기 (확장: 60/90/120일 판매량 포함)
async function fetchAccountData(account: CoupangAccount, paidDateFrom: string, paidDateTo: string) {
  const config: CoupangConfig = {
    vendorId: account.vendorId,
    accessKey: account.accessKey,
    secretKey: account.secretKey,
  };

  // 재고 데이터
  let inventory: any[] = [];
  let nextToken: string | undefined;
  let pages = 0;
  
  try {
    do {
      const response = await getRocketGrowthInventory(config, config.vendorId, { nextToken });
      inventory = [...inventory, ...(response.data || [])];
      nextToken = response.nextToken;
      pages++;
      if (pages >= MAX_INVENTORY_PAGES) break;
      if (nextToken) await sleep(API_DELAY_MS);
    } while (nextToken);
    console.log(`[${account.name}] 재고: ${inventory.length}개`);
  } catch (err) {
    console.error(`[${account.name}] 재고 조회 실패:`, err);
  }

  // 7일 주문 데이터 (기존 로직 유지)
  let orders: any[] = [];
  let orderToken: string | undefined;
  let orderPages = 0;
  
  try {
    do {
      const response = await getRocketGrowthOrders(config, {
        vendorId: config.vendorId,
        paidDateFrom,
        paidDateTo,
        nextToken: orderToken,
      });
      orders = [...orders, ...(response.data || [])];
      orderToken = response.nextToken;
      orderPages++;
      if (orderPages >= MAX_ORDER_PAGES) break;
      if (orderToken) await sleep(API_DELAY_MS);
    } while (orderToken);
    console.log(`[${account.name}] 7일 주문: ${orders.length}개`);
  } catch (err) {
    console.error(`[${account.name}] 7일 주문 조회 실패:`, err);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 확장: 60일/90일/120일 판매량 집계 (30일씩 분할 호출)
  // ─────────────────────────────────────────────────────────────────────
  const extendedSales: Record<number, { d60: number; d90: number; d120: number }> = {};

  // 31일~120일 구간의 주문 수집 (30일까지는 재고 API에서 제공)
  const extendedRanges = [
    { label: 'd60', ranges: splitDateRange(60).filter(r => {
      const daysAgo = Math.ceil((Date.now() - new Date(r.from).getTime()) / (24 * 60 * 60 * 1000));
      return daysAgo > 30;
    })},
    { label: 'd90', ranges: splitDateRange(90).filter(r => {
      const daysAgo = Math.ceil((Date.now() - new Date(r.from).getTime()) / (24 * 60 * 60 * 1000));
      return daysAgo > 60;
    })},
    { label: 'd120', ranges: splitDateRange(120).filter(r => {
      const daysAgo = Math.ceil((Date.now() - new Date(r.from).getTime()) / (24 * 60 * 60 * 1000));
      return daysAgo > 90;
    })},
  ];

  // 전체 120일 주문을 한 번에 수집하여 기간별로 분류
  const allExtendedOrders: any[] = [];
  const allRanges = splitDateRange(120);
  
  // 최초 30일은 이미 가져왔으므로 30일 이후부터만
  const rangesAfter30d = allRanges.filter(r => {
    const fromDaysAgo = Math.ceil((Date.now() - new Date(r.from).getTime()) / (24 * 60 * 60 * 1000));
    return fromDaysAgo > 30;
  });

  for (let i = 0; i < rangesAfter30d.length; i++) {
    const range = rangesAfter30d[i];
    console.log(`[${account.name}] 확장 주문 조회: ${range.from} ~ ${range.to} (${i + 1}/${rangesAfter30d.length})`);
    
    const periodOrders = await fetchAllOrdersForPeriod(
      config,
      config.vendorId,
      formatDateToYYYYMMDD(range.from),
      formatDateToYYYYMMDD(range.to)
    );
    allExtendedOrders.push(...periodOrders);

    if (i < rangesAfter30d.length - 1) {
      await sleep(API_DELAY_MS * 2);
    }
  }

  // 31일~120일 주문에서 기간별 판매량 집계
  for (const order of allExtendedOrders) {
    const paidDate = new Date(order.paidAt);
    const daysAgo = Math.ceil((Date.now() - paidDate.getTime()) / (24 * 60 * 60 * 1000));

    for (const item of (order.orderItems || [])) {
      const vid = item.vendorItemId;
      if (!extendedSales[vid]) {
        extendedSales[vid] = { d60: 0, d90: 0, d120: 0 };
      }
      const qty = item.salesQuantity || 1;

      // 누적: 60일 = 30일API값 + 31~60일 주문
      if (daysAgo <= 60) extendedSales[vid].d60 += qty;
      if (daysAgo <= 90) extendedSales[vid].d90 += qty;
      if (daysAgo <= 120) extendedSales[vid].d120 += qty;
    }
  }

  return { inventory, orders, extendedSales, accountName: account.name };
}

export async function GET(request: NextRequest) {
  try {
    const accounts = getCoupangAccounts();
    
    if (accounts.length === 0) {
      return NextResponse.json({ error: 'No Coupang accounts configured' }, { status: 500 });
    }

    const today = getDateString(0);
    const sevenDaysAgo = getDateString(7);
    const paidDateFrom = formatDateToYYYYMMDD(sevenDaysAgo);
    const paidDateTo = formatDateToYYYYMMDD(today);

    // 모든 계정에서 병렬로 데이터 가져오기
    const results = await Promise.all(
      accounts.map(account => fetchAccountData(account, paidDateFrom, paidDateTo))
    );

    // 모든 계정 데이터 병합
    let allInventory: any[] = [];
    let allOrders: any[] = [];
    const allExtendedSales: Record<number, { d60: number; d90: number; d120: number }> = {};
    const accountNames: string[] = [];

    results.forEach(result => {
      // 재고에 계정명 추가
      result.inventory.forEach(item => {
        item._accountName = result.accountName;
      });
      allInventory = [...allInventory, ...result.inventory];
      allOrders = [...allOrders, ...result.orders];
      accountNames.push(result.accountName);

      // 확장 판매량 병합
      for (const [vidStr, sales] of Object.entries(result.extendedSales)) {
        const vid = Number(vidStr);
        if (!allExtendedSales[vid]) {
          allExtendedSales[vid] = { d60: 0, d90: 0, d120: 0 };
        }
        allExtendedSales[vid].d60 += sales.d60;
        allExtendedSales[vid].d90 += sales.d90;
        allExtendedSales[vid].d120 += sales.d120;
      }
    });

    console.log(`전체 재고: ${allInventory.length}개, 전체 주문: ${allOrders.length}개 (계정: ${accountNames.join(', ')})`);

    // 주문에서 상품명 매핑 + 7일 판매량 계산
    const nameMap: Record<number, string> = {};
    const sales7d: Record<number, number> = {};
    
    allOrders.forEach(order => {
      (order.orderItems || []).forEach((item: any) => {
        const id = item.vendorItemId;
        nameMap[id] = item.productName;
        sales7d[id] = (sales7d[id] || 0) + (item.salesQuantity || 1);
      });
    });

    // 입고예정 데이터 가져오기
    const incomingStock: Record<string, number> = {};
    try {
      const supabase = await createClient();
      const { data: inboundItems } = await supabase
        .from('inbound_items')
        .select(`
          sku,
          quantity,
          inbound_request:inbound_requests!inner(status)
        `)
        .eq('inbound_request.status', 'in_transit');
      
      if (inboundItems) {
        inboundItems.forEach((item: any) => {
          if (item.sku) {
            incomingStock[item.sku] = (incomingStock[item.sku] || 0) + item.quantity;
          }
        });
      }
    } catch (err) {
      console.log('Inbound table not available yet');
    }

    // 재고 데이터와 합치기 (60/90/120일 판매량 포함)
    const stockSummary = allInventory.map(item => {
      const vendorItemId = item.vendorItemId;
      const totalQty = item.inventoryDetails?.totalOrderableQuantity || 0;
      const sales30d = item.salesCountMap?.SALES_COUNT_LAST_THIRTY_DAYS || 0;
      const extended = allExtendedSales[vendorItemId] || { d60: 0, d90: 0, d120: 0 };
      
      return {
        vendorItemId,
        productName: nameMap[vendorItemId] || `Unknown (${vendorItemId})`,
        totalStock: totalQty,
        availableStock: totalQty,
        incomingStock: incomingStock[String(vendorItemId)] || 0,
        sales7d: sales7d[vendorItemId] || 0,
        sales30d,
        // 확장 판매량: 30일(API) + 31~N일(주문 집계)
        sales60d: sales30d + extended.d60,
        sales90d: sales30d + extended.d90,
        sales120d: sales30d + extended.d120,
        externalSkuId: item.externalSkuId || null,
        accountName: item._accountName, // 어느 계정 상품인지 표시
      };
    });

    // 정렬: 이름 있는 것 우선, 30일 판매량 순
    stockSummary.sort((a, b) => {
      const aHasName = !a.productName.startsWith('Unknown');
      const bHasName = !b.productName.startsWith('Unknown');
      if (aHasName !== bHasName) return bHasName ? 1 : -1;
      return b.sales30d - a.sales30d;
    });

    return NextResponse.json({
      success: true,
      data: stockSummary,
      total: stockSummary.length,
      accounts: accountNames,
      updatedAt: new Date().toISOString(),
      period: {
        sales7d: { from: sevenDaysAgo, to: today },
        sales30d: 'Last 30 days (from API)',
        sales60d: 'Last 60 days (API 30d + orders 31~60d)',
        sales90d: 'Last 90 days (API 30d + orders 31~90d)',
        sales120d: 'Last 120 days (API 30d + orders 31~120d)',
      },
    });
  } catch (error) {
    console.error('Stock Summary API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
