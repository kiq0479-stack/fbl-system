import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSellerProducts, getSellerProductDetail, getRocketGrowthInventory, getCoupangConfig } from '@/lib/coupang';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const config = getCoupangConfig();
    
    // 정렬 옵션 (기본값: 오름차순)
    const { searchParams } = new URL(request.url);
    const sortOrder = searchParams.get('sort') || 'asc'; // 'asc' or 'desc'
    
    // 1. 로켓그로스 재고 API에서 재고 > 0인 vendorItemId 목록 가져오기
    let allInventory: any[] = [];
    let nextToken: string | undefined;
    
    do {
      const response = await getRocketGrowthInventory(config, config.vendorId, {
        nextToken,
      });
      allInventory = [...allInventory, ...(response.data || [])];
      nextToken = response.nextToken || undefined;
    } while (nextToken);

    // 재고 있는 vendorItemId Set 생성 + externalSkuId 맵
    const rocketGrowthIds = new Set<string>();
    const externalSkuMap = new Map<string, string>();  // vendorItemId -> externalSkuId
    
    for (const item of allInventory) {
      const qty = item.inventoryDetails?.totalOrderableQuantity || 0;
      if (qty > 0) {
        const vid = String(item.vendorItemId);
        rocketGrowthIds.add(vid);
        if (item.externalSkuId) {
          externalSkuMap.set(vid, String(item.externalSkuId));
        }
      }
    }

    console.log(`로켓그로스 재고 있는 상품: ${rocketGrowthIds.size}개`);

    // 2. 상품 목록 API에서 판매중 상품 가져오기
    let allProducts: any[] = [];
    nextToken = undefined;
    
    do {
      const response = await getSellerProducts(config, config.vendorId, {
        nextToken,
        maxPerPage: 100,
      });
      allProducts = [...allProducts, ...(response.data || [])];
      nextToken = response.nextToken || undefined;
    } while (nextToken);

    // 판매중 상품만 필터 (키다리 상품 제외 - 판매중지)
    const sellingProducts = allProducts.filter(p => 
      (p.statusName === '승인완료' || p.statusName === '판매중') &&
      !p.sellerProductName?.includes('키다리')
    );
    
    console.log(`판매중 상품: ${sellingProducts.length}개`);

    // 3. 각 상품의 상세 조회해서 옵션(items) 정보 가져오기
    const productItems: any[] = [];
    
    for (const product of sellingProducts) {
      try {
        const detail = await getSellerProductDetail(config, String(product.sellerProductId));
        const productData = detail.data;
        
        if (productData && productData.items && Array.isArray(productData.items)) {
          for (const item of productData.items) {
            // 로켓그로스 vendorItemId는 rocketGrowthItemData에 있음
            const rocketData = (item as any).rocketGrowthItemData;
            if (!rocketData) continue;
            
            const vid = String(rocketData.vendorItemId);
            
            // 로켓그로스 재고가 있는 옵션만 추가
            if (rocketGrowthIds.has(vid)) {
              productItems.push({
                sellerProductId: product.sellerProductId,
                sellerProductName: product.sellerProductName,
                vendorItemId: vid,
                externalSkuId: externalSkuMap.get(vid) || null,  // 쿠팡 externalSkuId (파렛트 적재리스트용)
                itemName: item.itemName,
                barcode: rocketData.barcode || null,  // 상품 상세의 rocketGrowthItemData.barcode 사용
              });
            }
          }
        }
      } catch (err) {
        console.error(`Failed to get detail for ${product.sellerProductId}:`, err);
      }
    }

    console.log(`판매중 + 로켓그로스 재고 있는 옵션: ${productItems.length}개`);

    if (productItems.length === 0) {
      return NextResponse.json({
        success: true,
        message: '판매중인 로켓그로스 상품이 없습니다.',
        added: 0,
      });
    }

    // 4. 상품 데이터 생성 (vendorItemId = 옵션ID 기준, 중복 제거)
    const productMap = new Map<string, any>();
    for (const item of productItems) {
      const sku = item.vendorItemId;
      if (!productMap.has(sku)) {
        // 상품명 = "상품명 옵션명" 형태로 조합
        const name = item.itemName 
          ? `${item.sellerProductName} ${item.itemName}`.trim()
          : item.sellerProductName || '상품명 없음';
        
        productMap.set(sku, {
          name: name,
          sku: sku,  // 옵션ID (vendorItemId)
          external_sku: item.externalSkuId,  // 쿠팡 externalSkuId (파렛트 적재리스트용)
          barcode: item.barcode,  // 실제 바코드 (rocketGrowthItemData.barcode)
          category: '쿠팡',
          is_active: true,
        });
      }
    }
    
    const uniqueProducts = Array.from(productMap.values());

    // 5. Upsert - SKU 기준으로 있으면 업데이트, 없으면 추가
    let addedCount = 0;
    let updatedCount = 0;
    
    for (const product of uniqueProducts) {
      // 먼저 SKU로 기존 상품 조회
      const { data: existing } = await (supabase
        .from('products') as any)
        .select('id')
        .eq('sku', product.sku)
        .single();
      
      if (existing) {
        // 기존 상품 업데이트 (name, barcode, external_sku 업데이트, 다른 필드는 유지)
        const { error: updateError } = await (supabase
          .from('products') as any)
          .update({
            name: product.name,
            barcode: product.barcode,
            external_sku: product.external_sku,
          })
          .eq('id', existing.id);
        
        if (!updateError) updatedCount++;
      } else {
        // 새 상품 추가
        const { error: insertError } = await (supabase
          .from('products') as any)
          .insert(product);
        
        if (!insertError) addedCount++;
      }
    }

    // 6. 결과 조회
    const { data: resultProducts } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: sortOrder === 'asc' });

    return NextResponse.json({
      success: true,
      message: `쿠팡 동기화 완료: 추가 ${addedCount}개, 업데이트 ${updatedCount}개`,
      added: addedCount,
      updated: updatedCount,
      products: resultProducts,
    });
  } catch (error) {
    console.error('Product sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
