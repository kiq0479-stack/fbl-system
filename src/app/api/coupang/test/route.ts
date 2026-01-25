import { NextResponse } from 'next/server';
import { getCoupangConfig, coupangRequest } from '@/lib/coupang';

// 쿠팡 API 연결 테스트
export async function GET() {
  try {
    const config = getCoupangConfig();
    
    // 간단한 API 테스트 - 반품지 목록 조회 (가장 가벼운 API)
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${config.vendorId}/returnShippingCenters`;
    
    const result = await coupangRequest('GET', path, config);

    return NextResponse.json({
      success: true,
      message: 'Coupang API 연결 성공!',
      data: result,
    });
  } catch (error) {
    console.error('Coupang API Test Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
