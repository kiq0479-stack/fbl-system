import { NextRequest, NextResponse } from 'next/server';
import { getOrders, getCoupangConfig } from '@/lib/coupang';

// KST 기준 날짜 범위의 timestamp 반환
function getKSTDateRange(from: string, to: string): { startTs: number; endTs: number } {
  const startTs = new Date(`${from}T00:00:00+09:00`).getTime();
  const endTs = new Date(`${to}T23:59:59.999+09:00`).getTime();
  return { startTs, endTs };
}

export async function GET(request: NextRequest) {
  try {
    const config = getCoupangConfig();
    const searchParams = request.nextUrl.searchParams;
    
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    
    if (!from || !to) {
      return NextResponse.json(
        { error: 'from, to 파라미터가 필요합니다. (YYYY-MM-DD 형식)' },
        { status: 400 }
      );
    }

    // 모든 상태의 주문을 가져오기
    const statuses = ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY'];
    const allOrders: any[] = [];

    for (const status of statuses) {
      try {
        const response = await getOrders(config, {
          vendorId: config.vendorId,
          createdAtFrom: from,
          createdAtTo: to,
          status,
          maxPerPage: 50,
        });
        
        if (response.data) {
          allOrders.push(...response.data);
        }
      } catch (e) {
        // 일부 상태 조회 실패해도 계속 진행
        console.error(`Failed to fetch orders with status ${status}:`, e);
      }
    }

    // KST 기준으로 요청된 날짜 범위만 필터링
    const { startTs, endTs } = getKSTDateRange(from, to);
    const filteredOrders = allOrders.filter(order => {
      const orderedAt = new Date(order.orderedAt).getTime();
      return orderedAt >= startTs && orderedAt <= endTs;
    });

    // orderedAt 기준으로 정렬 (최신순)
    filteredOrders.sort((a, b) => 
      new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime()
    );

    return NextResponse.json({
      code: 200,
      message: 'SUCCESS',
      data: filteredOrders,
      total: filteredOrders.length,
    });
  } catch (error) {
    console.error('Seller Delivery Orders API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
