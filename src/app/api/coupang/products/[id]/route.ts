import { NextRequest, NextResponse } from 'next/server';
import { getSellerProductDetail, getCoupangConfig } from '@/lib/coupang';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const config = getCoupangConfig();
    
    const response = await getSellerProductDetail(config, id);

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Product Detail API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
