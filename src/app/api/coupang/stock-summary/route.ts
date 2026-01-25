import { NextRequest, NextResponse } from 'next/server';
import { getRocketGrowthInventory, getRocketGrowthOrders, getCoupangConfig } from '@/lib/coupang';
import { createClient } from '@/lib/supabase/server';

// 최대 페이지 수 제한 (무한 루프 방지)
const MAX_INVENTORY_PAGES = 5;
const MAX_ORDER_PAGES = 3;

// 날짜 계산 헬퍼
function getDateString(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

function formatDateToYYYYMMDD(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

export async function GET(request: NextRequest) {
  try {
    const config = getCoupangConfig();
    
    // 1. 재고 데이터 가져오기 (최대 MAX_INVENTORY_PAGES 페이지)
    let allInventory: any[] = [];
    let nextToken: string | undefined;
    let inventoryPages = 0;
    
    do {
      const inventoryResponse = await getRocketGrowthInventory(config, config.vendorId, {
        nextToken,
      });
      allInventory = [...allInventory, ...(inventoryResponse.data || [])];
      nextToken = inventoryResponse.nextToken;
      inventoryPages++;
      
      if (inventoryPages >= MAX_INVENTORY_PAGES) {
        console.log(`재고 API 최대 페이지(${MAX_INVENTORY_PAGES}) 도달`);
        break;
      }
    } while (nextToken);

    console.log(`재고 조회 완료: ${allInventory.length}개 (${inventoryPages}페이지)`);

    // 2. 7일간 주문 데이터 가져오기 (최대 MAX_ORDER_PAGES 페이지)
    const today = getDateString(0);
    const sevenDaysAgo = getDateString(7);
    
    const paidDateFrom = formatDateToYYYYMMDD(sevenDaysAgo);
    const paidDateTo = formatDateToYYYYMMDD(today);
    
    let allOrders: any[] = [];
    let orderNextToken: string | undefined;
    let orderPages = 0;
    
    do {
      const ordersResponse = await getRocketGrowthOrders(config, {
        vendorId: config.vendorId,
        paidDateFrom,
        paidDateTo,
        nextToken: orderNextToken,
      });
      allOrders = [...allOrders, ...(ordersResponse.data || [])];
      orderNextToken = ordersResponse.nextToken;
      orderPages++;
      
      if (orderPages >= MAX_ORDER_PAGES) {
        console.log(`주문 API 최대 페이지(${MAX_ORDER_PAGES}) 도달`);
        break;
      }
    } while (orderNextToken);

    console.log(`주문 조회 완료: ${allOrders.length}개 (${orderPages}페이지)`);

    // 3. 주문에서 상품명 매핑 + 7일 판매량 계산
    const nameMap: Record<number, string> = {};
    const sales7d: Record<number, number> = {};
    
    allOrders.forEach(order => {
      (order.orderItems || []).forEach((item: any) => {
        const id = item.vendorItemId;
        nameMap[id] = item.productName;
        sales7d[id] = (sales7d[id] || 0) + (item.salesQuantity || 1);
      });
    });

    // 3.5 입고예정 데이터 가져오기 (in_transit 상태만 - 실제 이동중인 것)
    // pending은 아직 출발 전이라 입고예정에 포함 안 함
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
            // SKU를 키로 사용 (SKU = vendorItemId)
            incomingStock[item.sku] = (incomingStock[item.sku] || 0) + item.quantity;
          }
        });
      }
    } catch (err) {
      // 테이블이 없으면 무시 (아직 마이그레이션 전)
      console.log('Inbound table not available yet');
    }

    // 4. 재고 데이터와 합치기
    const stockSummary = allInventory.map(item => {
      const vendorItemId = item.vendorItemId;
      const totalQty = item.inventoryDetails?.totalOrderableQuantity || 0;
      const sales30d = item.salesCountMap?.SALES_COUNT_LAST_THIRTY_DAYS || 0;
      
      return {
        vendorItemId,
        productName: nameMap[vendorItemId] || `Unknown (${vendorItemId})`,
        totalStock: totalQty,           // 쿠팡물류 총합 (판매가능재고)
        availableStock: totalQty,       // 판매가능재고
        incomingStock: incomingStock[String(vendorItemId)] || 0, // 입고예정재고 (우리 DB - SKU로 매칭)
        sales7d: sales7d[vendorItemId] || 0,
        sales30d,
        externalSkuId: item.externalSkuId || null,
      };
    });

    // 5. 판매량 있는 상품 우선, 30일 판매량 순으로 정렬
    stockSummary.sort((a, b) => {
      // 이름 있는 것 우선
      const aHasName = !a.productName.startsWith('Unknown');
      const bHasName = !b.productName.startsWith('Unknown');
      if (aHasName !== bHasName) return bHasName ? 1 : -1;
      // 30일 판매량 순
      return b.sales30d - a.sales30d;
    });

    return NextResponse.json({
      success: true,
      data: stockSummary,
      total: stockSummary.length,
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
