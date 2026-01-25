import { NextRequest, NextResponse } from 'next/server';
import { getRocketGrowthInventory, getCoupangConfig } from '@/lib/coupang';

export async function GET(request: NextRequest) {
  try {
    const config = getCoupangConfig();
    const searchParams = request.nextUrl.searchParams;
    const vendorItemId = searchParams.get('vendorItemId') || undefined;
    
    // 페이징 처리 - 모든 재고 데이터 가져오기
    let allInventory: any[] = [];
    let nextToken: string | undefined;
    
    do {
      const response = await getRocketGrowthInventory(config, config.vendorId, {
        vendorItemId,
        nextToken,
      });
      
      allInventory = [...allInventory, ...(response.data || [])];
      nextToken = response.nextToken || undefined;
    } while (nextToken);

    return NextResponse.json({
      code: 'SUCCESS',
      message: 'OK',
      data: allInventory,
      total: allInventory.length,
    });
  } catch (error) {
    console.error('Rocket Growth Inventory API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
