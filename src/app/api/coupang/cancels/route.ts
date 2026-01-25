import { NextRequest, NextResponse } from 'next/server';
import { getCancelRequests, getCoupangConfig } from '@/lib/coupang';

export async function GET(request: NextRequest) {
  try {
    const config = getCoupangConfig();
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
    
    // 날짜 형식 변환 - YYYY-MM-DD -> YYYY-MM-DDTHH:mm
    const createdAtFrom = from.includes('T') ? from : `${from}T00:00`;
    const createdAtTo = to.includes('T') ? to : `${to}T23:59`;
    
    // 취소 요청 목록 조회
    // cancelType=CANCEL일 때는 status 파라미터 사용 불가
    const response = await getCancelRequests(config, {
      vendorId: config.vendorId,
      createdAtFrom,
      createdAtTo,
      cancelType: cancelType || undefined,
      status: status || undefined,
      searchType: searchType || undefined,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('Cancel Requests API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
