import { NextRequest, NextResponse } from 'next/server';
import { getRevenueHistory, getCoupangConfig } from '@/lib/coupang';

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
    
    // 매출내역 조회 API (매출인식일 기준)
    const response = await getRevenueHistory(config, {
      vendorId: config.vendorId,
      recognitionDateFrom: from,
      recognitionDateTo: to,
    });

    // 페이징 처리 - nextToken이 있으면 모든 데이터 가져오기
    let allData = response.data || [];
    let nextToken = response.nextToken;
    
    while (nextToken) {
      const nextResponse = await getRevenueHistory(config, {
        vendorId: config.vendorId,
        recognitionDateFrom: from,
        recognitionDateTo: to,
        nextToken,
      });
      
      allData = [...allData, ...(nextResponse.data || [])];
      nextToken = nextResponse.nextToken;
    }

    return NextResponse.json({
      code: response.code,
      message: response.message,
      data: allData,
      total: allData.length,
    });
  } catch (error) {
    console.error('Revenue History API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
