import { NextResponse } from 'next/server';
import { getSellerProducts, getCoupangConfig } from '@/lib/coupang';

export async function GET() {
  try {
    const config = getCoupangConfig();
    
    let allProducts: any[] = [];
    let nextToken: string | undefined;
    
    do {
      const response = await getSellerProducts(config, config.vendorId, {
        nextToken,
        maxPerPage: 100,
      });
      
      allProducts = [...allProducts, ...(response.data || [])];
      nextToken = response.nextToken || undefined;
    } while (nextToken);

    return NextResponse.json({
      success: true,
      total: allProducts.length,
      data: allProducts,
    });
  } catch (error) {
    console.error('Products API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
