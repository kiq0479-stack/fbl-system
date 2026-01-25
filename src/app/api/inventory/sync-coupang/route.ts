import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRocketGrowthInventory, getCoupangConfig } from '@/lib/coupang';

export async function POST() {
  try {
    const supabase = await createClient();
    const config = getCoupangConfig();
    
    // 1. 로켓그로스 재고 API에서 모든 재고 가져오기
    let allInventory: any[] = [];
    let nextToken: string | undefined;
    
    do {
      const response = await getRocketGrowthInventory(config, config.vendorId, {
        nextToken,
      });
      allInventory = [...allInventory, ...(response.data || [])];
      nextToken = response.nextToken || undefined;
    } while (nextToken);

    console.log(`쿠팡 로켓그로스 재고 조회: ${allInventory.length}개`);

    // 2. 재고 > 0인 항목만 필터링하고, vendorItemId(SKU)로 매핑
    const inventoryMap = new Map<string, number>();
    for (const item of allInventory) {
      const qty = item.inventoryDetails?.totalOrderableQuantity || 0;
      const sku = String(item.vendorItemId);
      if (qty > 0) {
        inventoryMap.set(sku, qty);
      }
    }

    console.log(`재고 있는 상품: ${inventoryMap.size}개`);

    // 3. 우리 DB의 상품 목록 조회 (SKU 매칭용)
    const { data: products } = await supabase
      .from('products')
      .select('id, sku, name');

    if (!products || products.length === 0) {
      return NextResponse.json({
        success: true,
        message: '등록된 상품이 없습니다. 먼저 상품을 동기화해주세요.',
        updated: 0,
        added: 0,
      });
    }

    // 4. 각 상품별로 쿠팡 재고 upsert
    let addedCount = 0;
    let updatedCount = 0;

    for (const product of (products as { id: string; sku: string; name: string }[])) {
      const coupangQty = inventoryMap.get(product.sku) || 0;
      
      // 기존 쿠팡 재고 조회
      const { data: existing } = await (supabase
        .from('inventory') as any)
        .select('id, quantity')
        .eq('product_id', product.id)
        .eq('location', 'coupang')
        .single();

      if (existing) {
        // 기존 재고 업데이트
        if (existing.quantity !== coupangQty) {
          await (supabase
            .from('inventory') as any)
            .update({ quantity: coupangQty, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
          updatedCount++;
        }
      } else if (coupangQty > 0) {
        // 새 재고 추가 (재고가 있는 경우만)
        await (supabase
          .from('inventory') as any)
          .insert({
            product_id: product.id,
            location: 'coupang',
            quantity: coupangQty,
          });
        addedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `쿠팡 재고 동기화 완료: 추가 ${addedCount}개, 업데이트 ${updatedCount}개`,
      added: addedCount,
      updated: updatedCount,
    });
  } catch (error) {
    console.error('Inventory sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
