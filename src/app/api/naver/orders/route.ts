import { NextRequest, NextResponse } from 'next/server';
import { 
  getProductOrders, 
  getNaverAccounts, 
  accountToConfig,
  NaverOrderStatus,
  NaverRangeType,
  NaverAccount,
  NaverConfig,
} from '@/lib/naver';

// 날짜를 YYYY-MM-DD 형식으로 변환
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// 두 날짜 사이의 일수 계산
function getDaysBetween(from: Date, to: Date): number {
  const diffTime = Math.abs(to.getTime() - from.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// 날짜 범위를 24시간 단위로 분할
function splitDateRange(fromStr: string, toStr: string): Array<{ from: string; to: string }> {
  const fromDate = new Date(fromStr);
  const toDate = new Date(toStr);
  
  const ranges: Array<{ from: string; to: string }> = [];
  const currentDate = new Date(fromDate);
  
  while (currentDate <= toDate) {
    const dayStart = new Date(currentDate);
    dayStart.setHours(0, 0, 0, 0);
    
    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);
    
    // toDate를 초과하지 않도록
    const effectiveEnd = dayEnd > toDate ? toDate : dayEnd;
    
    ranges.push({
      from: dayStart.toISOString(),
      to: effectiveEnd.toISOString(),
    });
    
    // 다음 날로 이동
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return ranges;
}

// 단일 계정, 단일 날짜 범위에서 주문 조회
async function fetchOrdersForDateRange(
  config: NaverConfig,
  account: NaverAccount,
  from: string,
  to: string,
  rangeType: NaverRangeType,
  productOrderStatuses?: NaverOrderStatus[],
  pageSize: number = 300,
) {
  try {
    const ordersResponse = await getProductOrders(config, {
      from,
      to,
      rangeType,
      productOrderStatuses,
      pageSize,
      page: 1,
    });
    
    const contents = ordersResponse.data?.contents || [];
    
    return contents.map(item => ({
      productOrderId: item.productOrderId,
      orderId: item.content.order.orderId,
      orderDate: item.content.order.orderDate,
      paymentDate: item.content.order.paymentDate,
      ordererName: item.content.order.ordererName,
      ordererTel: item.content.order.ordererTel,
      paymentMeans: item.content.order.paymentMeans,
      productName: item.content.productOrder.productName,
      productOption: item.content.productOrder.productOption || null,  // 옵션명
      optionCode: item.content.productOrder.optionCode || null,        // 옵션코드
      quantity: item.content.productOrder.quantity,
      unitPrice: item.content.productOrder.unitPrice,
      totalPaymentAmount: item.content.productOrder.totalPaymentAmount,
      productOrderStatus: item.content.productOrder.productOrderStatus,
      placeOrderStatus: item.content.productOrder.placeOrderStatus,
      shippingMemo: item.content.productOrder.shippingMemo,
      expectedSettlementAmount: item.content.productOrder.expectedSettlementAmount,
      shippingAddress: item.content.productOrder.shippingAddress,
      delivery: item.content.delivery,
      _accountName: account.name,
      _storeName: account.storeName,
    }));
  } catch (err) {
    console.error(`[${account.name}] ${from} 주문 조회 실패:`, err);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const accounts = getNaverAccounts();
    
    if (accounts.length === 0) {
      return NextResponse.json(
        { error: 'Naver API credentials not configured' },
        { status: 500 }
      );
    }
    
    const searchParams = request.nextUrl.searchParams;
    
    // 쿼리 파라미터 파싱
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const rangeType = (searchParams.get('rangeType') || 'PAYED_DATETIME') as NaverRangeType;
    const statusesParam = searchParams.get('statuses');
    const productOrderStatuses = statusesParam 
      ? statusesParam.split(',') as NaverOrderStatus[]
      : undefined;
    const pageSize = parseInt(searchParams.get('pageSize') || '300', 10);
    
    // from 파라미터 필수
    if (!from) {
      return NextResponse.json(
        { error: 'from parameter is required (ISO 8601 format or YYYY-MM-DD)' },
        { status: 400 }
      );
    }
    
    // from, to를 ISO 형식으로 변환 (YYYY-MM-DD 형식 지원)
    const fromDate = new Date(from);
    const toDate = to ? new Date(to) : new Date(from);
    
    // to가 날짜만 있으면 해당 일자의 끝으로 설정
    if (to && to.length === 10) {
      toDate.setHours(23, 59, 59, 999);
    }
    if (from.length === 10) {
      fromDate.setHours(0, 0, 0, 0);
    }
    
    const dayCount = getDaysBetween(fromDate, toDate) + 1;
    
    // 최대 31일 제한 (API 부하 방지)
    if (dayCount > 31) {
      return NextResponse.json(
        { error: '최대 31일까지만 조회 가능합니다.' },
        { status: 400 }
      );
    }
    
    console.log(`[Naver Orders] 조회 기간: ${formatDate(fromDate)} ~ ${formatDate(toDate)} (${dayCount}일)`);
    
    // 날짜 범위를 24시간 단위로 분할
    const dateRanges = splitDateRange(fromDate.toISOString(), toDate.toISOString());
    
    // 각 계정 및 날짜 범위에 대해 병렬로 주문 조회
    const accountResults = await Promise.all(accounts.map(async (account) => {
      const config = accountToConfig(account);
      
      // 모든 날짜 범위에 대해 병렬 조회 (최대 5개씩 배치로)
      const batchSize = 5;
      const allOrders: ReturnType<typeof fetchOrdersForDateRange> extends Promise<infer T> ? T : never = [];
      
      for (let i = 0; i < dateRanges.length; i += batchSize) {
        const batch = dateRanges.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(range => 
            fetchOrdersForDateRange(
              config,
              account,
              range.from,
              range.to,
              rangeType,
              productOrderStatuses,
              pageSize,
            )
          )
        );
        allOrders.push(...batchResults.flat());
        
        // API 호출 간 약간의 딜레이 (rate limiting 방지)
        if (i + batchSize < dateRanges.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // 중복 제거 (productOrderId 기준)
      const uniqueOrders = Array.from(
        new Map(allOrders.map(order => [order.productOrderId, order])).values()
      );
      
      return {
        accountName: account.name,
        orders: uniqueOrders,
        count: uniqueOrders.length,
      };
    }));
    
    // 모든 주문 병합
    const allOrders = accountResults.flatMap(r => r.orders || []);
    
    // 날짜순 정렬 (최신순)
    allOrders.sort((a, b) => 
      new Date(b.orderDate || b.paymentDate || 0).getTime() - 
      new Date(a.orderDate || a.paymentDate || 0).getTime()
    );

    return NextResponse.json({
      code: 'SUCCESS',
      message: 'OK',
      data: allOrders,
      totalCount: allOrders.length,
      dateRange: {
        from: formatDate(fromDate),
        to: formatDate(toDate),
        days: dayCount,
      },
      accounts: accountResults.map(r => ({
        name: r.accountName,
        count: r.count,
      })),
    });
  } catch (error) {
    console.error('Naver API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
