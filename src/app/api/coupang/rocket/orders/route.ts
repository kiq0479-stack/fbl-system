import { NextRequest, NextResponse } from 'next/server';
import { getRocketGrowthOrders, getCoupangConfig } from '@/lib/coupang';

// YYYY-MM-DD를 yyyymmdd로 변환
function formatDateToYYYYMMDD(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

// paidDateTo를 다음날로 설정 (쿠팡 API가 exclusive 처리하는 것으로 추정)
function getNextDay(dateStr: string): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 1);
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

// KST 기준 날짜 범위의 timestamp 반환
function getKSTDateRange(from: string, to: string): { startTs: number; endTs: number } {
  // KST = UTC+9
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
    
    // 로켓그로스 주문 목록 조회 API (결제일 기준)
    // 쿠팡 API는 paidDateTo가 exclusive이므로 다음날까지 지정
    const paidDateFrom = formatDateToYYYYMMDD(from);
    const paidDateTo = getNextDay(to);
    
    const response = await getRocketGrowthOrders(config, {
      vendorId: config.vendorId,
      paidDateFrom,
      paidDateTo,
    });

    // 페이징 처리 - nextToken이 있으면 모든 데이터 가져오기
    let allOrders = response.data || [];
    let nextToken = response.nextToken;
    
    while (nextToken) {
      const nextResponse = await getRocketGrowthOrders(config, {
        vendorId: config.vendorId,
        paidDateFrom: formatDateToYYYYMMDD(from),
        paidDateTo: paidDateTo,
        nextToken,
      });
      
      allOrders = [...allOrders, ...(nextResponse.data || [])];
      nextToken = nextResponse.nextToken;
    }

    // KST 기준으로 요청된 날짜 범위만 필터링
    const { startTs, endTs } = getKSTDateRange(from, to);
    const filteredOrders = allOrders.filter(order => {
      const paidAt = order.paidAt;
      return paidAt >= startTs && paidAt <= endTs;
    });

    // NOTE: 로켓그로스 API는 취소된 주문을 구분하는 status 필드를 제공하지 않음
    // 취소 요청 API(/v6/returnRequests)는 판매자배송(Wing)용이므로 로켓그로스에는 적용 불가
    // 정확한 매출 확인은 매출내역(Revenue) API를 사용해야 함

    return NextResponse.json({
      code: response.code,
      message: response.message,
      data: filteredOrders,
      total: filteredOrders.length,
      // 로켓그로스 API는 취소 상태 정보를 제공하지 않음
      note: '취소 건 포함 데이터입니다. 정확한 매출은 매출내역 탭을 확인하세요.',
    });
  } catch (error) {
    console.error('Rocket Growth Orders API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
