import { NextRequest, NextResponse } from 'next/server';
import { getRocketGrowthOrders, getCoupangAccounts } from '@/lib/coupang';

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
  const startTs = new Date(`${from}T00:00:00+09:00`).getTime();
  const endTs = new Date(`${to}T23:59:59.999+09:00`).getTime();
  return { startTs, endTs };
}

export async function GET(request: NextRequest) {
  try {
    const accounts = getCoupangAccounts();
    const searchParams = request.nextUrl.searchParams;
    
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    
    if (!from || !to) {
      return NextResponse.json(
        { error: 'from, to 파라미터가 필요합니다. (YYYY-MM-DD 형식)' },
        { status: 400 }
      );
    }
    
    const paidDateFrom = formatDateToYYYYMMDD(from);
    const paidDateTo = getNextDay(to);
    const { startTs, endTs } = getKSTDateRange(from, to);

    // 모든 계정에서 주문 가져오기
    const allAccountOrders = await Promise.all(
      accounts.map(async (account) => {
        const config = {
          vendorId: account.vendorId,
          accessKey: account.accessKey,
          secretKey: account.secretKey,
        };

        try {
          let allOrders: any[] = [];
          let nextToken: string | undefined;

          do {
            const response = await getRocketGrowthOrders(config, {
              vendorId: config.vendorId,
              paidDateFrom,
              paidDateTo,
              nextToken,
            });
            allOrders = [...allOrders, ...(response.data || [])];
            nextToken = response.nextToken;
          } while (nextToken);

          // 각 주문에 계정명 추가
          return allOrders.map(order => ({
            ...order,
            _accountName: account.name,
          }));
        } catch (err) {
          console.error(`[${account.name}] 로켓그로스 주문 조회 실패:`, err);
          return [];
        }
      })
    );

    // 모든 주문 병합
    const mergedOrders = allAccountOrders.flat();

    // KST 기준으로 요청된 날짜 범위만 필터링
    const filteredOrders = mergedOrders.filter(order => {
      const paidAt = order.paidAt;
      return paidAt >= startTs && paidAt <= endTs;
    });

    // 결제일 기준 최신순 정렬
    filteredOrders.sort((a, b) => b.paidAt - a.paidAt);

    return NextResponse.json({
      code: 0,
      message: 'OK',
      data: filteredOrders,
      total: filteredOrders.length,
      accounts: accounts.map(a => a.name),
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
