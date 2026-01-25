import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRocketGrowthInventory, getCoupangConfig } from '@/lib/coupang';

// 최대 페이지네이션 횟수 (무한 루프 방지)
const MAX_PAGES = 10;

export async function POST() {
  try {
    const supabase = await createClient();
    const config = getCoupangConfig();
    
    // 1. 로켓그로스 재고 API에서 재고 가져오기 (최대 MAX_PAGES 페이지)
    let allInventory: any[] = [];
    let nextToken: string | undefined;
    let pageCount = 0;
    
    do {
      const response = await getRocketGrowthInventory(config, config.vendorId, {
        nextToken,
      });
      allInventory = [...allInventory, ...(response.data || [])];
      nextToken = response.nextToken || undefined;
      pageCount++;
      
      // 무한 루프 방지
      if (pageCount >= MAX_PAGES) {
        console.log(`최대 페이지(${MAX_PAGES}) 도달, 조회 중단`);
        break;
      }
    } while (nextToken);

    console.log(`쿠팡 로켓그로스 재고 조회: ${allInventory.length}개 (${pageCount}페이지)`);

    // 2. vendorItemId(SKU)로 재고 매핑
    const inventoryMap = new Map<string, number>();
    for (const item of allInventory) {
      const qty = item.inventoryDetails?.totalOrderableQuantity || 0;
      const sku = String(item.vendorItemId);
      inventoryMap.set(sku, qty);
    }

    console.log(`총 상품: ${inventoryMap.size}개`);

    // 3. 우리 DB의 상품 목록 조회 (SKU 및 external_sku 매칭용)
    const { data: products } = await supabase
      .from('products')
      .select('id, sku, external_sku, name');

    if (!products || products.length === 0) {
      return NextResponse.json({
        success: true,
        message: '등록된 상품이 없습니다. 먼저 상품을 동기화해주세요.',
        updated: 0,
        added: 0,
        totalCoupangItems: inventoryMap.size,
      });
    }

    // 4. 기존 쿠팡 재고 한 번에 조회
    const { data: existingInventory } = await (supabase
      .from('inventory') as any)
      .select('id, product_id, quantity')
      .eq('location', 'coupang');

    const existingMap = new Map<string, { id: string; quantity: number }>();
    for (const inv of (existingInventory || [])) {
      existingMap.set(inv.product_id, { id: inv.id, quantity: inv.quantity });
    }

    // 5. 배치로 처리
    const toInsert: any[] = [];
    const toUpdate: { id: string; quantity: number }[] = [];
    const matched: string[] = [];
    const notMatched: string[] = [];

    // 쿠팡 vendorItemId 목록 (디버깅용)
    const coupangVendorItemIds = Array.from(inventoryMap.keys()).slice(0, 20);

    for (const product of (products as { id: string; sku: string; external_sku: string | null; name: string }[])) {
      // sku가 쿠팡 vendorItemId이므로 sku로 먼저 매칭
      // (external_sku는 쿠팡의 externalSkuId로 다른 값임)
      const coupangQty = inventoryMap.get(product.sku) || 0;
      const existing = existingMap.get(product.id);

      if (coupangQty > 0) {
        matched.push(`${product.name}: ${product.sku} -> ${coupangQty}`);
      } else {
        notMatched.push(`${product.name}: ${product.sku}`);
      }

      if (existing) {
        if (existing.quantity !== coupangQty) {
          toUpdate.push({ id: existing.id, quantity: coupangQty });
        }
      } else if (coupangQty > 0) {
        toInsert.push({
          product_id: product.id,
          location: 'coupang',
          quantity: coupangQty,
        });
      }
    }

    console.log('쿠팡 vendorItemIds (샘플):', coupangVendorItemIds);
    console.log('매칭된 상품:', matched);
    console.log('매칭 안된 상품:', notMatched);

    // 6. 배치 insert
    if (toInsert.length > 0) {
      await (supabase.from('inventory') as any).insert(toInsert);
    }

    // 7. 배치 update (Supabase는 bulk update 미지원이라 개별 처리하되, Promise.all로 병렬)
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
      totalCoupangItems: inventoryMap.size,
    });
  } catch (error) {
    console.error('Inventory sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
