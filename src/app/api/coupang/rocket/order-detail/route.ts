import { NextRequest, NextResponse } from 'next/server';
import { getRocketGrowthOrderDetail, getCoupangConfig } from '@/lib/coupang';

export async function GET(request: NextRequest) {
  try {
    const config = getCoupangConfig();
    const searchParams = request.nextUrl.searchParams;
    const orderId = searchParams.get('orderId');
    
    if (!orderId) {
      return NextResponse.json({ error: 'orderId 파라미터가 필요합니다.' }, { status: 400 });
    }
    
    const response = await getRocketGrowthOrderDetail(config, config.vendorId, orderId);
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Rocket Growth Order Detail API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
