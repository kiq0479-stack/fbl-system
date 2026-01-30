/**
 * ============================================================================
 * 판매량 집계 API
 * ============================================================================
 * 
 * 쿠팡 로켓그로스 + 쿠팡 판매자배송 + 네이버 스토어의 기간별 판매량을 집계합니다.
 * 
 * ## 데이터 소스 (3개)
 * 1. 쿠팡 로켓그로스 (coupang_rocket) — 로켓그로스 주문 API + 재고 API
 * 2. 쿠팡 판매자배송 (coupang_seller) — 판매자 배송 주문 API
 * 3. 네이버 스마트스토어 (naver) — 네이버 커머스 API
 * 
 * ## 응답 형태
 * ```json
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "vendorItemId": 12345,
 *       "productName": "상품명",
 *       "sku": "SKU-001",
 *       "sales": { "d7": 10, "d30": 45, "d60": 88, "d90": 120, "d120": 155 },
 *       "source": "coupang_rocket"
 *     }
 *   ]
 * }
 * ```
 * 
 * ## 쿠팡 API 제한
 * - 최대 조회 기간: 30일
 * - 분당 호출 제한: 50회
 * - 120일 조회 시 최소 4번 분할 호출 필요
 * 
 * @route GET /api/sales/summary
 * @query accountId - 쿠팡 계정 ID (선택, 기본: 전체 계정)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getRocketGrowthOrders,
  getRocketGrowthInventory,
  getOrders,
  getCoupangAccounts,
  CoupangAccount,
  CoupangConfig,
  CoupangOrderSheet,
  RocketGrowthOrder,
} from '@/lib/coupang';
import { getNaverSalesSummary, isNaverCommerceAvailable } from '@/lib/naver-commerce';

// ============================================================================
// 상수
// ============================================================================

/** 판매량 집계 기간 (일수) */
const SALES_PERIODS = [7, 30, 60, 90, 120] as const;

/** 쿠팡 API 최대 조회 기간 (일) */
const COUPANG_MAX_DAYS = 30;

/** 주문 페이지네이션 최대 페이지 (무한 루프 방지) */
const MAX_ORDER_PAGES = 20;

/** API 호출 간 딜레이 (ms) - 분당 50회 제한 대응 */
const API_CALL_DELAY_MS = 300;

// ============================================================================
// 헬퍼 함수
// ============================================================================

/**
 * N일 전 날짜 문자열 반환 (YYYY-MM-DD)
 */
function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * YYYY-MM-DD를 yyyymmdd로 변환 (쿠팡 API 형식)
 */
function toYYYYMMDD(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/**
 * 오늘 날짜 문자열 (YYYY-MM-DD)
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 지정 밀리초 대기 (Rate Limit 대응)
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 긴 기간을 30일 이하 구간으로 분할
 * 
 * 예: 90일 → [{from: -90, to: -61}, {from: -60, to: -31}, {from: -30, to: 0}]
 * 
 * @param totalDays - 전체 조회 기간 (일)
 * @returns 날짜 구간 배열 [{from: 'YYYY-MM-DD', to: 'YYYY-MM-DD'}, ...]
 */
function splitDateRange(totalDays: number): Array<{ from: string; to: string }> {
  const ranges: Array<{ from: string; to: string }> = [];
  const today = getToday();
  
  let remaining = totalDays;
  let endOffset = 0;

  while (remaining > 0) {
    const chunkDays = Math.min(remaining, COUPANG_MAX_DAYS);
    const startOffset = endOffset + chunkDays;

    ranges.push({
      from: getDateDaysAgo(startOffset),
      to: getDateDaysAgo(endOffset),
    });

    endOffset = startOffset;
    remaining -= chunkDays;
  }

  return ranges;
}

// ============================================================================
// 쿠팡 데이터 수집
// ============================================================================

/**
 * 단일 기간의 로켓그로스 주문 전체 수집 (페이지네이션 포함)
 */
async function fetchRocketOrdersForPeriod(
  config: CoupangConfig,
  vendorId: string,
  dateFrom: string,
  dateTo: string
): Promise<RocketGrowthOrder[]> {
  const allOrders: RocketGrowthOrder[] = [];
  let nextToken: string | undefined;
  let pages = 0;

  try {
    do {
      const response = await getRocketGrowthOrders(config, {
        vendorId,
        paidDateFrom: toYYYYMMDD(dateFrom),
        paidDateTo: toYYYYMMDD(dateTo),
        nextToken,
      });

      allOrders.push(...(response.data || []));
      nextToken = response.nextToken;
      pages++;

      if (pages >= MAX_ORDER_PAGES) {
        console.warn(`[SalesSummary] Max pages reached for ${dateFrom}~${dateTo}`);
        break;
      }

      // Rate limit 대응
      if (nextToken) {
        await sleep(API_CALL_DELAY_MS);
      }
    } while (nextToken);
  } catch (error) {
    console.error(`[SalesSummary] Order fetch error (${dateFrom}~${dateTo}):`, error);
  }

  return allOrders;
}

/**
 * 단일 기간의 판매자 배송 주문 전체 수집
 * 
 * 판매자 배송 API는 createdAtFrom/To (YYYY-MM-DD) 형식 사용.
 * 주문 상태 구분 없이 전체 조회 (ACCEPT~FINAL_DELIVERY).
 */
async function fetchSellerOrdersForPeriod(
  config: CoupangConfig,
  vendorId: string,
  dateFrom: string,
  dateTo: string
): Promise<CoupangOrderSheet[]> {
  const allOrders: CoupangOrderSheet[] = [];

  // 판매자 배송 주문 상태별 조회 (전체 상태 커버)
  const statuses = ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY'];

  for (const status of statuses) {
    try {
      const response = await getOrders(config, {
        vendorId,
        createdAtFrom: dateFrom,
        createdAtTo: dateTo,
        status,
        maxPerPage: 50,
      });

      allOrders.push(...(response.data || []));
      await sleep(API_CALL_DELAY_MS);
    } catch (error) {
      // 특정 상태 조회 실패 시 무시하고 계속
      console.warn(`[SalesSummary] Seller order fetch error (${status}, ${dateFrom}~${dateTo}):`, error);
    }
  }

  return allOrders;
}

/**
 * 단일 계정의 판매자 배송 판매량 수집
 * 
 * 120일간 주문 데이터를 30일씩 분할 수집하여 기간별 집계.
 */
async function fetchSellerSalesData(account: CoupangAccount): Promise<SalesSummaryItem[]> {
  const config: CoupangConfig = {
    vendorId: account.vendorId,
    accessKey: account.accessKey,
    secretKey: account.secretKey,
  };

  const maxDays = SALES_PERIODS[SALES_PERIODS.length - 1]; // 120일
  const dateRanges = splitDateRange(maxDays);

  // vendorItemId → 기간별 판매량
  const salesByItem = new Map<number, {
    productName: string;
    totalByPeriod: Record<string, number>;
  }>();

  for (let i = 0; i < dateRanges.length; i++) {
    const range = dateRanges[i];
    console.log(`[SalesSummary][${account.name}] 판매자배송 주문 조회: ${range.from} ~ ${range.to} (${i + 1}/${dateRanges.length})`);

    const orders = await fetchSellerOrdersForPeriod(
      config,
      account.vendorId,
      range.from,
      range.to
    );

    // 주문별 아이템 집계
    for (const order of orders) {
      const orderedDate = new Date(order.orderedAt);
      const daysAgo = Math.ceil((Date.now() - orderedDate.getTime()) / (24 * 60 * 60 * 1000));

      for (const item of (order.orderItems || [])) {
        if (!salesByItem.has(item.vendorItemId)) {
          salesByItem.set(item.vendorItemId, {
            productName: item.vendorItemName || item.sellerProductName || '',
            totalByPeriod: {},
          });
        }

        const entry = salesByItem.get(item.vendorItemId)!;
        // 상품명 업데이트 (더 구체적인 이름 우선)
        if (item.vendorItemName) {
          entry.productName = item.vendorItemName;
        }

        const qty = item.shippingCount || 1;

        for (const period of SALES_PERIODS) {
          const key = `d${period}`;
          if (daysAgo <= period) {
            entry.totalByPeriod[key] = (entry.totalByPeriod[key] || 0) + qty;
          }
        }
      }
    }

    // 구간 간 Rate Limit 대응
    if (i < dateRanges.length - 1) {
      await sleep(API_CALL_DELAY_MS * 2);
    }
  }

  // 결과 생성
  const results: SalesSummaryItem[] = [];

  for (const [vendorItemId, data] of salesByItem) {
    results.push({
      vendorItemId,
      productName: data.productName || `Unknown Seller Item (${vendorItemId})`,
      sku: null,
      sales: {
        d7: data.totalByPeriod['d7'] || 0,
        d30: data.totalByPeriod['d30'] || 0,
        d60: data.totalByPeriod['d60'] || 0,
        d90: data.totalByPeriod['d90'] || 0,
        d120: data.totalByPeriod['d120'] || 0,
      },
      source: 'coupang_seller',
      accountName: account.name,
    });
  }

  console.log(`[SalesSummary][${account.name}] 판매자배송 상품: ${results.length}개`);
  return results;
}

/**
 * 단일 계정의 로켓그로스 기간별 판매량 수집
 * 
 * 30일 이하: 재고 API의 salesCountMap 활용 (정확도 높음)
 * 30일 초과: 주문 API에서 직접 집계 (분할 호출)
 */
async function fetchAccountSalesData(account: CoupangAccount) {
  const config: CoupangConfig = {
    vendorId: account.vendorId,
    accessKey: account.accessKey,
    secretKey: account.secretKey,
  };

  // 1) 재고 API에서 30일 판매량 + 상품 정보 가져오기
  const inventoryMap = new Map<number, {
    productName: string;
    externalSkuId: string | null;
    sales30dFromApi: number;
  }>();

  try {
    let nextToken: string | undefined;
    let pages = 0;

    do {
      const response = await getRocketGrowthInventory(config, config.vendorId, { nextToken });

      for (const item of (response.data || [])) {
        inventoryMap.set(item.vendorItemId, {
          productName: '', // 주문 데이터에서 채울 예정
          externalSkuId: item.externalSkuId || null,
          sales30dFromApi: item.salesCountMap?.SALES_COUNT_LAST_THIRTY_DAYS || 0,
        });
      }

      nextToken = response.nextToken;
      pages++;
      if (pages >= 50) break;
      if (nextToken) await sleep(API_CALL_DELAY_MS);
    } while (nextToken);

    console.log(`[SalesSummary][${account.name}] 재고 항목: ${inventoryMap.size}개`);
  } catch (error) {
    console.error(`[SalesSummary][${account.name}] 재고 조회 실패:`, error);
  }

  // 2) 120일간의 주문 데이터 수집 (30일씩 분할)
  const maxDays = SALES_PERIODS[SALES_PERIODS.length - 1]; // 120일
  const dateRanges = splitDateRange(maxDays);

  // vendorItemId → 일별 판매량 맵
  const salesByItem = new Map<number, {
    productName: string;
    totalByPeriod: Record<string, number>; // 'dN' → 판매량
  }>();

  // 각 구간별 주문 수집
  for (let i = 0; i < dateRanges.length; i++) {
    const range = dateRanges[i];
    console.log(`[SalesSummary][${account.name}] 주문 조회: ${range.from} ~ ${range.to} (${i + 1}/${dateRanges.length})`);

    const orders = await fetchRocketOrdersForPeriod(
      config,
      account.vendorId,
      range.from,
      range.to
    );

    // 주문 아이템별 집계
    for (const order of orders) {
      for (const item of (order.orderItems || [])) {
        const existing = salesByItem.get(item.vendorItemId);
        if (existing) {
          existing.productName = item.productName || existing.productName;
        } else {
          salesByItem.set(item.vendorItemId, {
            productName: item.productName || '',
            totalByPeriod: {},
          });
        }
      }
    }

    // 기간별 합산: 이 구간이 어느 기간에 해당하는지 계산
    const rangeStartDaysAgo = Math.ceil(
      (Date.now() - new Date(range.from).getTime()) / (24 * 60 * 60 * 1000)
    );

    for (const order of orders) {
      for (const item of (order.orderItems || [])) {
        const entry = salesByItem.get(item.vendorItemId)!;
        const qty = item.salesQuantity || 1;

        // 주문 결제일이 각 기간에 포함되는지 확인
        const paidDate = new Date(order.paidAt);
        const daysAgo = Math.ceil((Date.now() - paidDate.getTime()) / (24 * 60 * 60 * 1000));

        for (const period of SALES_PERIODS) {
          const key = `d${period}`;
          if (daysAgo <= period) {
            entry.totalByPeriod[key] = (entry.totalByPeriod[key] || 0) + qty;
          }
        }
      }
    }

    // 구간 간 Rate Limit 대응
    if (i < dateRanges.length - 1) {
      await sleep(API_CALL_DELAY_MS * 2);
    }
  }

  // 3) 재고 API와 주문 데이터 병합
  // 재고 API에 있지만 주문에는 없는 상품도 포함
  for (const [vendorItemId, invData] of inventoryMap) {
    if (!salesByItem.has(vendorItemId)) {
      salesByItem.set(vendorItemId, {
        productName: invData.productName,
        totalByPeriod: {},
      });
    }
  }

  // 최종 결과 생성
  const results: SalesSummaryItem[] = [];

  for (const [vendorItemId, data] of salesByItem) {
    const invData = inventoryMap.get(vendorItemId);

    results.push({
      vendorItemId,
      productName: data.productName || invData?.productName || `Unknown (${vendorItemId})`,
      sku: invData?.externalSkuId || null,
      sales: {
        d7: data.totalByPeriod['d7'] || 0,
        d30: data.totalByPeriod['d30'] || invData?.sales30dFromApi || 0,
        d60: data.totalByPeriod['d60'] || 0,
        d90: data.totalByPeriod['d90'] || 0,
        d120: data.totalByPeriod['d120'] || 0,
      },
      source: 'coupang_rocket',
      accountName: account.name,
    });
  }

  return results;
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
    d90: number;
    d120: number;
  };
  source: string;
  accountName?: string;
}

// ============================================================================
// API Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');

    // 쿠팡 계정 조회
    const allAccounts = getCoupangAccounts();
    if (allAccounts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No Coupang accounts configured' },
        { status: 500 }
      );
    }

    // 특정 계정 필터링
    const accounts = accountId
      ? allAccounts.filter(a => a.id === accountId)
      : allAccounts;

    if (accounts.length === 0) {
      return NextResponse.json(
        { success: false, error: `Account not found: ${accountId}` },
        { status: 404 }
      );
    }

    console.log(`[SalesSummary] 집계 시작: ${accounts.map(a => a.name).join(', ')}`);
    const startTime = Date.now();

    // ─────────────────────────────────────────────────────────────────────
    // 1. 쿠팡 로켓그로스 판매량 수집
    // ─────────────────────────────────────────────────────────────────────
    const coupangRocketResults = await Promise.all(
      accounts.map(account => fetchAccountSalesData(account))
    );

    // ─────────────────────────────────────────────────────────────────────
    // 1-2. 쿠팡 판매자배송 판매량 수집
    // ─────────────────────────────────────────────────────────────────────
    let coupangSellerResults: SalesSummaryItem[][] = [];
    try {
      coupangSellerResults = await Promise.all(
        accounts.map(account => fetchSellerSalesData(account))
      );
    } catch (error) {
      console.error('[SalesSummary] 판매자배송 수집 실패 (무시):', error);
    }

    const allItems: SalesSummaryItem[] = [
      ...coupangRocketResults.flat(),
      ...coupangSellerResults.flat(),
    ];

    // ─────────────────────────────────────────────────────────────────────
    // 2. 네이버 커머스 판매량 수집 (환경변수 있을 때만)
    // ─────────────────────────────────────────────────────────────────────
    let naverItems: SalesSummaryItem[] = [];

    if (isNaverCommerceAvailable()) {
      console.log('[SalesSummary] 네이버 커머스 판매량 수집 시작');

      try {
        for (const period of SALES_PERIODS) {
          const dateFrom = getDateDaysAgo(period);
          const dateTo = getToday();
          const naverSales = await getNaverSalesSummary(dateFrom, dateTo);

          for (const sale of naverSales) {
            // 기존 네이버 아이템 찾기 또는 생성
            let existing = naverItems.find(item => item.productName === sale.productName);
            if (!existing) {
              existing = {
                vendorItemId: 0, // 네이버는 vendorItemId 없음
                productName: sale.productName,
                sku: null,
                sales: { d7: 0, d30: 0, d60: 0, d90: 0, d120: 0 },
                source: 'naver',
              };
              naverItems.push(existing);
            }

            const key = `d${period}` as keyof typeof existing.sales;
            existing.sales[key] = sale.salesQuantity;
          }
        }
        console.log(`[SalesSummary] 네이버 상품: ${naverItems.length}개`);
      } catch (error) {
        console.error('[SalesSummary] 네이버 판매량 수집 실패:', error);
        // 에러시 무시하고 쿠팡 데이터만 반환
      }
    } else {
      console.log('[SalesSummary] 네이버 커머스 API 미설정 - skip');
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. 결과 병합 및 정렬
    // ─────────────────────────────────────────────────────────────────────
    const mergedItems = [...allItems, ...naverItems];

    // 30일 판매량 기준 내림차순 정렬
    mergedItems.sort((a, b) => b.sales.d30 - a.sales.d30);

    const elapsed = Date.now() - startTime;
    console.log(`[SalesSummary] 집계 완료: ${mergedItems.length}개 상품, ${elapsed}ms`);

    return NextResponse.json({
      success: true,
      data: mergedItems,
      total: mergedItems.length,
      accounts: accounts.map(a => a.name),
      sources: {
        coupang_rocket: coupangRocketResults.flat().length,
        coupang_seller: coupangSellerResults.flat().length,
        naver: naverItems.length,
      },
      naverEnabled: isNaverCommerceAvailable(),
      periods: SALES_PERIODS,
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
      { status: 500 }
    );
  }
}
