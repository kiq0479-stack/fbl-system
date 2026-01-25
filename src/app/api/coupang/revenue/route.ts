import { NextRequest, NextResponse } from 'next/server';
import { getRevenueHistory, getCoupangAccounts } from '@/lib/coupang';

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
    
    // 모든 계정에서 매출내역 가져오기
    const allAccountData = await Promise.all(
      accounts.map(async (account) => {
        const config = {
          vendorId: account.vendorId,
          accessKey: account.accessKey,
          secretKey: account.secretKey,
        };

        try {
          let allData: any[] = [];
          let nextToken: string | undefined;

          do {
            const response = await getRevenueHistory(config, {
              vendorId: config.vendorId,
              recognitionDateFrom: from,
              recognitionDateTo: to,
              nextToken,
            });
            allData = [...allData, ...(response.data || [])];
            nextToken = response.nextToken;
          } while (nextToken);

          // 각 항목에 계정명 추가
          return allData.map(item => ({
            ...item,
            _accountName: account.name,
          }));
        } catch (err) {
          console.error(`[${account.name}] 매출내역 조회 실패:`, err);
          return [];
        }
      })
    );

    // 모든 데이터 병합
    const mergedData = allAccountData.flat();

    // 매출인식일 기준 최신순 정렬
    mergedData.sort((a, b) => new Date(b.recognizedAt).getTime() - new Date(a.recognizedAt).getTime());

    return NextResponse.json({
      code: 0,
      message: 'OK',
      data: mergedData,
      total: mergedData.length,
      accounts: accounts.map(a => a.name),
    });
  } catch (error) {
    console.error('Revenue History API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
