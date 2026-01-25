import { NextRequest, NextResponse } from 'next/server';
import { getRocketGrowthInventory, getCoupangAccounts } from '@/lib/coupang';

export async function GET(request: NextRequest) {
  try {
    const accounts = getCoupangAccounts();
    const searchParams = request.nextUrl.searchParams;
    const vendorItemId = searchParams.get('vendorItemId') || undefined;
    
    // 모든 계정에서 재고 데이터 가져오기
    let allInventory: any[] = [];
    
    for (const account of accounts) {
      const config = {
        vendorId: account.vendorId,
        accessKey: account.accessKey,
        secretKey: account.secretKey,
      };
      
      let nextToken: string | undefined;
      
      do {
        const response = await getRocketGrowthInventory(config, config.vendorId, {
          vendorItemId,
          nextToken,
        });
        
        // 계정명 추가
        const dataWithAccount = (response.data || []).map(item => ({
          ...item,
          _accountName: account.name,
        }));
        
        allInventory = [...allInventory, ...dataWithAccount];
        nextToken = response.nextToken || undefined;
      } while (nextToken);
    }

    return NextResponse.json({
      code: 'SUCCESS',
      message: 'OK',
      data: allInventory,
      total: allInventory.length,
      accounts: accounts.map(a => a.name),
    });
  } catch (error) {
    console.error('Rocket Growth Inventory API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
