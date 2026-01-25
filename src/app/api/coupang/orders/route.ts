import { NextRequest, NextResponse } from 'next/server';
import { getOrders, getCoupangAccounts } from '@/lib/coupang';

export async function GET(request: NextRequest) {
  try {
    const accounts = getCoupangAccounts();
    const searchParams = request.nextUrl.searchParams;
    
    const createdAtFrom = searchParams.get('from') || undefined;
    const createdAtTo = searchParams.get('to') || undefined;
    const status = searchParams.get('status') || undefined;
    
    // 모든 계정에서 주문 가져오기
    const allOrdersPromises = accounts.map(async (account) => {
      const config = {
        vendorId: account.vendorId,
        accessKey: account.accessKey,
        secretKey: account.secretKey,
      };
      
      try {
        const response = await getOrders(config, {
          vendorId: config.vendorId,
          createdAtFrom,
          createdAtTo,
          status,
        });
        
        // 각 주문에 계정명 추가
        const ordersWithAccount = (response.data || []).map(order => ({
          ...order,
          _accountName: account.name,
        }));
        
        return { ...response, data: ordersWithAccount };
      } catch (err) {
        console.error(`[${account.name}] 주문 조회 실패:`, err);
        return { code: 'ERROR', message: String(err), data: [] };
      }
    });

    const results = await Promise.all(allOrdersPromises);
    
    // 모든 주문 병합
    const allOrders = results.flatMap(r => r.data || []);
    
    // 날짜순 정렬 (최신순)
    allOrders.sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime());

    return NextResponse.json({
      code: 'SUCCESS',
      message: 'OK',
      data: allOrders,
      accounts: accounts.map(a => a.name),
    });
  } catch (error) {
    console.error('Coupang API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
