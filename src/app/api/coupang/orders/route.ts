import { NextRequest, NextResponse } from 'next/server';
import { getOrders, getCoupangConfig } from '@/lib/coupang';

export async function GET(request: NextRequest) {
  try {
    const config = getCoupangConfig();
    const searchParams = request.nextUrl.searchParams;
    
    const createdAtFrom = searchParams.get('from') || undefined;
    const createdAtTo = searchParams.get('to') || undefined;
    const status = searchParams.get('status') || undefined;
    
    const orders = await getOrders(config, {
      vendorId: config.vendorId,
      createdAtFrom,
      createdAtTo,
      status,
    });

    return NextResponse.json(orders);
  } catch (error) {
    console.error('Coupang API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
