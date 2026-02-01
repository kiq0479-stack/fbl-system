import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRocketGrowthInventory, getCoupangAccounts } from '@/lib/coupang';

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

    // 2. 모든 상품 × 모든 계정 동시 병렬 조회 (33개 × 2계정 = ~66건, 동시 실행)
    const inventoryMap = new Map<string, number>();
    const skuList = products.map((p: any) => p.sku).filter(Boolean);

    await Promise.all(accounts.map(async (account) => {
      const config = {
        vendorId: account.vendorId,
        accessKey: account.accessKey,
        secretKey: account.secretKey,
      };

      const results = await Promise.all(
        skuList.map(async (sku: string) => {
          try {
            const res = await getRocketGrowthInventory(config, config.vendorId, { vendorItemId: sku });
            if (res.data?.[0]) {
              return { sku, qty: res.data[0].inventoryDetails?.totalOrderableQuantity || 0 };
            }
          } catch {}
          return null;
        })
      );

      for (const r of results) {
        if (r && r.qty > 0) {
          const prev = inventoryMap.get(r.sku) || 0;
          if (r.qty > prev) inventoryMap.set(r.sku, r.qty);
        }
      }
    }));

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
