import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRocketGrowthInventory, getCoupangAccounts } from '@/lib/coupang';

// 쿠팡 API 동시 호출 최대 10개 (15개부터 429 에러)
const BATCH_SIZE = 10;

async function batchParallel<T>(items: T[], fn: (item: T) => Promise<any>): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export async function POST() {
  try {
    const supabase = await createClient();
    const accounts = getCoupangAccounts();

    // 1. DB 상품 + 기존 재고 동시 조회
    const [{ data: products }, { data: existingInventory }] = await Promise.all([
      (supabase.from('products') as any).select('id, sku, name'),
      (supabase.from('inventory') as any).select('id, product_id, quantity').eq('location', 'coupang'),
    ]);

    if (!products?.length) {
      return NextResponse.json({ success: true, message: '등록된 상품 없음', updated: 0, added: 0 });
    }

    const existingMap = new Map<string, { id: string; quantity: number }>();
    for (const inv of (existingInventory || [])) {
      existingMap.set(inv.product_id, { id: inv.id, quantity: inv.quantity });
    }

    // 2. 계정별 → 상품 10개씩 병렬 조회
    const inventoryMap = new Map<string, number>();
    const skuList: string[] = products.map((p: any) => p.sku).filter(Boolean);

    for (const account of accounts) {
      const config = {
        vendorId: account.vendorId,
        accessKey: account.accessKey,
        secretKey: account.secretKey,
      };

      await batchParallel(skuList, async (sku: string) => {
        try {
          const res = await getRocketGrowthInventory(config, config.vendorId, { vendorItemId: sku });
          if (res.data?.[0]) {
            const qty = res.data[0].inventoryDetails?.totalOrderableQuantity || 0;
            if (qty > 0) {
              const prev = inventoryMap.get(sku) || 0;
              if (qty > prev) inventoryMap.set(sku, qty);
            }
          }
        } catch {}
      });
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
    const dbOps: Promise<any>[] = [];
    if (toInsert.length > 0) {
      dbOps.push((supabase.from('inventory') as any).insert(toInsert));
    }
    if (toUpdate.length > 0) {
      dbOps.push(...toUpdate.map(item =>
        (supabase.from('inventory') as any)
          .update({ quantity: item.quantity, updated_at: new Date().toISOString() })
          .eq('id', item.id)
      ));
    }
    if (dbOps.length > 0) await Promise.all(dbOps);

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
