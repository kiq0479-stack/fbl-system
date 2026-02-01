import { NextRequest, NextResponse } from 'next/server';
import { getRocketGrowthInventory, getCoupangAccounts } from '@/lib/coupang';

/**
 * 쿠팡 재고 프록시 (가볍게!)
 * 
 * GET: SKU 목록 받아서 쿠팡 API만 호출 후 결과 반환
 * DB 업데이트는 클라이언트에서 직접 수행
 */
export async function GET(request: NextRequest) {
  try {
    const skus = request.nextUrl.searchParams.get('skus')?.split(',').filter(Boolean);
    if (!skus?.length) {
      return NextResponse.json({ error: 'skus parameter required' }, { status: 400 });
    }

    const accounts = getCoupangAccounts();
    const results: Record<string, number> = {};

    // 모든 계정에서 동시 조회
    await Promise.all(accounts.map(async (account) => {
      const config = {
        vendorId: account.vendorId,
        accessKey: account.accessKey,
        secretKey: account.secretKey,
      };

      const batchResults = await Promise.all(
        skus.map(async (sku) => {
          try {
            const res = await getRocketGrowthInventory(config, config.vendorId, { vendorItemId: sku });
            if (res.data?.[0]) {
              return { sku, qty: res.data[0].inventoryDetails?.totalOrderableQuantity || 0 };
            }
          } catch {}
          return null;
        })
      );

      for (const r of batchResults) {
        if (r && r.qty > 0) {
          results[r.sku] = Math.max(results[r.sku] || 0, r.qty);
        }
      }
    }));

    return NextResponse.json({ success: true, inventory: results });
  } catch (error) {
    console.error('Coupang inventory proxy error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST도 유지 (하위 호환)
export async function POST() {
  return NextResponse.json({ error: 'Use GET with ?skus=sku1,sku2 now. Sync is client-side.' }, { status: 400 });
}
