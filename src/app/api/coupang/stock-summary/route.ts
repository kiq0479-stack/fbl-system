import { NextRequest, NextResponse } from 'next/server';
import { getRocketGrowthInventory, getRocketGrowthOrders, getCoupangAccounts, CoupangAccount } from '@/lib/coupang';
import { createClient } from '@/lib/supabase/server';

// 최대 페이지 수 제한 (무한 루프 방지)
const MAX_INVENTORY_PAGES = 50;
const MAX_ORDER_PAGES = 10;

// 날짜 계산 헬퍼
function getDateString(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

function formatDateToYYYYMMDD(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

// 단일 계정의 재고/주문 데이터 가져오기
async function fetchAccountData(account: CoupangAccount, paidDateFrom: string, paidDateTo: string) {
  const config = {
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
    } while (nextToken);
    console.log(`[${account.name}] 재고: ${inventory.length}개`);
  } catch (err) {
    console.error(`[${account.name}] 재고 조회 실패:`, err);
  }

  // 주문 데이터
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
    } while (orderToken);
    console.log(`[${account.name}] 주문: ${orders.length}개`);
  } catch (err) {
    console.error(`[${account.name}] 주문 조회 실패:`, err);
  }

  return { inventory, orders, accountName: account.name };
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
    const accountNames: string[] = [];

    results.forEach(result => {
      // 재고에 계정명 추가
      result.inventory.forEach(item => {
        item._accountName = result.accountName;
      });
      allInventory = [...allInventory, ...result.inventory];
      allOrders = [...allOrders, ...result.orders];
      accountNames.push(result.accountName);
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

    // 재고 데이터와 합치기
    const stockSummary = allInventory.map(item => {
      const vendorItemId = item.vendorItemId;
      const totalQty = item.inventoryDetails?.totalOrderableQuantity || 0;
      const sales30d = item.salesCountMap?.SALES_COUNT_LAST_THIRTY_DAYS || 0;
      
      return {
        vendorItemId,
        productName: nameMap[vendorItemId] || `Unknown (${vendorItemId})`,
        totalStock: totalQty,
        availableStock: totalQty,
        incomingStock: incomingStock[String(vendorItemId)] || 0,
        sales7d: sales7d[vendorItemId] || 0,
        sales30d,
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
