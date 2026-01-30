import { NextResponse } from 'next/server';
import { 
  getAllSaleProducts, 
  getNaverAccounts, 
  accountToConfig,
} from '@/lib/naver';

/**
 * GET /api/naver/products
 * 
 * 네이버 판매중인 상품 목록 조회
 * 모든 계정의 판매중 상품을 통합하여 반환
 */
export async function GET() {
  try {
    const accounts = getNaverAccounts();
    
    if (accounts.length === 0) {
      return NextResponse.json(
        { error: 'Naver API credentials not configured' },
        { status: 500 }
      );
    }
    
    // 각 계정에서 판매중인 상품 조회
    const accountResults = await Promise.all(accounts.map(async (account) => {
      const config = accountToConfig(account);
      
      try {
        const products = await getAllSaleProducts(config);
        return {
          accountName: account.name,
          products: products.map(p => {
            // 채널 상품에서 상품명 추출 (첫 번째 채널 상품 사용)
            const channelProduct = p.channelProducts?.[0];
            return {
              originProductNo: p.originProductNo,
              channelProductNo: channelProduct?.channelProductNo || p.channelProductNo,
              productName: channelProduct?.name || p.channelProductName || p.originProductName || '',
              salePrice: channelProduct?.salePrice || p.salePrice,
              stockQuantity: channelProduct?.stockQuantity || p.stockQuantity,
              statusType: channelProduct?.statusType || p.statusType,
              _accountName: account.name,
              _storeName: account.storeName,
            };
          }),
          count: products.length,
        };
      } catch (err) {
        console.error(`[${account.name}] 상품 조회 실패:`, err);
        return {
          accountName: account.name,
          products: [],
          count: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }));
    
    // 모든 상품 병합
    const allProducts = accountResults.flatMap(r => r.products);
    
    // 상품명으로 정렬
    allProducts.sort((a, b) => a.productName.localeCompare(b.productName, 'ko'));
    
    // 고유 상품명 추출
    const uniqueProductNames = [...new Set(allProducts.map(p => p.productName))].filter(Boolean);

    return NextResponse.json({
      code: 'SUCCESS',
      message: 'OK',
      data: allProducts,
      productNames: uniqueProductNames,
      totalCount: allProducts.length,
      accounts: accountResults.map(r => ({
        name: r.accountName,
        count: r.count,
        error: r.error,
      })),
    });
  } catch (error) {
    console.error('Naver Products API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
