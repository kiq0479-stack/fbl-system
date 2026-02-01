import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRocketGrowthInventory, getCoupangAccounts } from '@/lib/coupang';

// Vercel 함수 타임아웃 60초 (Pro 플랜)
export const maxDuration = 60;

export async function POST() {
  try {
    const supabase = await createClient();
    const accounts = getCoupangAccounts();

    // 1. 모든 계정에서 재고 수집 (페이지네이션)
    const inventoryMap = new Map<string, number>();

    await Promise.all(accounts.map(async (account) => {
      const config = {
        vendorId: account.vendorId,
        accessKey: account.accessKey,
        secretKey: account.secretKey,
      };

      let nextToken: string | undefined;
      let pageCount = 0;

      do {
        const response = await getRocketGrowthInventory(config, config.vendorId, { nextToken });
        for (const item of (response.data || [])) {
          const sku = String(item.vendorItemId);
          const qty = item.inventoryDetails?.totalOrderableQuantity || 0;
          inventoryMap.set(sku, qty);
        }
        nextToken = response.nextToken || undefined;
        pageCount++;
      } while (nextToken && pageCount < 50);

      console.log(`[${account.name}] ${pageCount}페이지 조회 완료`);
    }));

    // 2. DB 상품 + 기존 재고 조회
    const { data: products } = await (supabase.from('products') as any).select('id, sku, name');
    const { data: existingInventory } = await (supabase.from('inventory') as any)
      .select('id, product_id, quantity')
      .eq('location', 'coupang');

    if (!products?.length) {
      return NextResponse.json({ success: true, message: '등록된 상품 없음', updated: 0, added: 0 });
    }

    const existingMap = new Map<string, { id: string; quantity: number }>();
    for (const inv of (existingInventory || [])) {
      existingMap.set(inv.product_id, { id: inv.id, quantity: inv.quantity });
    }

    // 3. 변경사항 계산
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
        toInsert.push({ product_id: product.id, location: 'coupang', quantity: coupangQty });
        changes.push(`${product.name}: 신규 ${coupangQty}`);
      }
    }

    // 4. DB 반영 (병렬)
    if (toInsert.length > 0) {
      await (supabase.from('inventory') as any).insert(toInsert);
    }
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
      message: `동기화 완료: 추가 ${toInsert.length}개, 업데이트 ${toUpdate.length}개`,
      added: toInsert.length,
      updated: toUpdate.length,
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
