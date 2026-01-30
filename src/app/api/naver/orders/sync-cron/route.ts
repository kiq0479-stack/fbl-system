import { NextRequest, NextResponse } from 'next/server';

/**
 * 네이버 주문 동기화 Cron 엔드포인트
 * Vercel Cron에서 GET으로 호출됨 → sync API를 POST로 내부 호출
 * 
 * 매일 UTC 22:00 (KST 07:00)에 실행
 * 기본: 최근 7일치 주문 동기화
 */
export async function GET(request: NextRequest) {
  try {
    // Vercel Cron 인증 확인
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 내부 sync API 호출
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL 
      || process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';

    const syncUrl = `${baseUrl}/api/naver/orders/sync`;

    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'auto',
        // from/to 생략 → sync API가 기본 7일로 처리
      }),
    });

    const result = await response.json();

    console.log('[NaverSync Cron] Result:', JSON.stringify(result));

    return NextResponse.json({
      success: true,
      message: 'Naver order sync cron executed',
      result,
    });
  } catch (error) {
    console.error('[NaverSync Cron] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Cron execution failed' 
      },
      { status: 500 },
    );
  }
}
