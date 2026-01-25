import { NextRequest, NextResponse } from 'next/server';
import { getCancelRequests, getCoupangAccounts } from '@/lib/coupang';

export async function GET(request: NextRequest) {
  try {
    const accounts = getCoupangAccounts();
    const searchParams = request.nextUrl.searchParams;
    
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const cancelType = searchParams.get('cancelType') as 'CANCEL' | 'RETURN' | 'EXCHANGE' | null;
    const status = searchParams.get('status');
    const searchType = searchParams.get('searchType') as 'timeFrame' | null;
    
    if (!from || !to) {
      return NextResponse.json(
        { error: 'from, to 파라미터가 필요합니다. (YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm 형식)' },
        { status: 400 }
      );
    }
    
    // 날짜 형식 변환
    const createdAtFrom = from.includes('T') ? from : `${from}T00:00`;
    const createdAtTo = to.includes('T') ? to : `${to}T23:59`;
    
    // 모든 계정에서 취소 요청 가져오기
    const allAccountData = await Promise.all(
      accounts.map(async (account) => {
        const config = {
          vendorId: account.vendorId,
          accessKey: account.accessKey,
          secretKey: account.secretKey,
        };

        try {
          const response = await getCancelRequests(config, {
            vendorId: config.vendorId,
            createdAtFrom,
            createdAtTo,
            cancelType: cancelType || undefined,
            status: status || undefined,
            searchType: searchType || undefined,
          });

          // 각 항목에 계정명 추가
          return (response.data || []).map(item => ({
            ...item,
            _accountName: account.name,
          }));
        } catch (err) {
          console.error(`[${account.name}] 취소 요청 조회 실패:`, err);
          return [];
        }
      })
    );

    // 모든 데이터 병합
    const mergedData = allAccountData.flat();

    // 생성일 기준 최신순 정렬
    mergedData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      code: 'SUCCESS',
      message: 'OK',
      data: mergedData,
      total: mergedData.length,
      accounts: accounts.map(a => a.name),
    });
  } catch (error) {
    console.error('Cancel Requests API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
