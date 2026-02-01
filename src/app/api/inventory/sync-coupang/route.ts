import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRocketGrowthInventory, getCoupangAccounts } from '@/lib/coupang';

/**
 * 쿠팡 재고 동기화 (최적화 버전)
 * 
 * 기존: 전체 페이지네이션 (30페이지+ = 600개+) → 느림 + 타임아웃
 * 변경: DB에 등록된 상품만 개별 조회 → 빠름 + 정확
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const accounts = getCoupangAccounts();

    // 1. DB에서 등록된 상품 목록 가져오기
    const { data: products } = await (supabase
      .from('products') as any)
      .select('id, sku, name');

    if (!products || products.length === 0) {
      return NextResponse.json({
        success: true,
        message: '등록된 상품이 없습니다.',
        updated: 0,
        added: 0,
      });
    }

    // 2. 기존 쿠팡 재고 한 번에 조회
    const { data: existingInventory } = await (supabase
      .from('inventory') as any)
      .select('id, product_id, quantity')
      .eq('location', 'coupang');

    const existingMap = new Map<string, { id: string; quantity: number }>();
    for (const inv of (existingInventory || [])) {
      existingMap.set(inv.product_id, { id: inv.id, quantity: inv.quantity });
    }

    // 3. 계정별로 상품 개별 조회 (vendorItemId 기준)
    //    어떤 상품이 어떤 계정인지 모르므로, 모든 계정에서 시도
    const inventoryMap = new Map<string, number>();

    // 상품 SKU 목록을 5개씩 병렬 조회 (API rate limit 고려)
    const BATCH_SIZE = 5;
    const skuList = products.map((p: any) => p.sku).filter(Boolean);

    for (const account of accounts) {
      const config = {
        vendorId: account.vendorId,
        accessKey: account.accessKey,
        secretKey: account.secretKey,
      };

      for (let i = 0; i < skuList.length; i += BATCH_SIZE) {
        const batch = skuList.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (sku: string) => {
            try {
              const res = await getRocketGrowthInventory(config, config.vendorId, {
                vendorItemId: sku,
              });
              if (res.data && res.data.length > 0) {
                return {
                  sku,
                  qty: res.data[0].inventoryDetails?.totalOrderableQuantity || 0,
                };
              }
              return null;
            } catch {
              return null;
            }
          })
        );

        for (const r of results) {
          if (r && r.qty > 0) {
            // 이미 다른 계정에서 찾은 게 있으면 더 큰 값 유지 (중복 방지)
            const prev = inventoryMap.get(r.sku) || 0;
            if (r.qty > prev) inventoryMap.set(r.sku, r.qty);
          }
        }
      }
    }

    console.log(`개별 조회 완료: ${inventoryMap.size}개 상품 재고 확인`);

    // 4. DB 업데이트
    const toInsert: any[] = [];
    const toUpdate: { id: string; quantity: number }[] = [];
    const changes: string[] = [];

    for (const product of products) {
      const coupangQty = inventoryMap.get(product.sku) || 0;
      const existing = existingMap.get(product.id);

      if (existing) {
        if (existing.quantity !== coupangQty) {
          toUpdate.push({ id: existing.id, quantity: coupangQty });
          changes.push(`${product.name}: ${existing.quantity} → ${coupangQty}`);
        }
      } else if (coupangQty > 0) {
        toInsert.push({
          product_id: product.id,
          location: 'coupang',
          quantity: coupangQty,
        });
        changes.push(`${product.name}: 신규 ${coupangQty}`);
      }
    }

    // 배치 insert
    if (toInsert.length > 0) {
      await (supabase.from('inventory') as any).insert(toInsert);
    }

    // 배치 update (Promise.all 병렬)
    if (toUpdate.length > 0) {
      await Promise.all(
        toUpdate.map(item =>
          (supabase.from('inventory') as any)
            .update({ quantity: item.quantity, updated_at: new Date().toISOString() })
            .eq('id', item.id)
        )
      );
    }

    return NextResponse.json({
      success: true,
      message: `쿠팡 재고 동기화 완료: 추가 ${toInsert.length}개, 업데이트 ${toUpdate.length}개`,
      added: toInsert.length,
      updated: toUpdate.length,
      totalProducts: products.length,
      changes: changes.slice(0, 20),
    });
  } catch (error) {
    console.error('Inventory sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
