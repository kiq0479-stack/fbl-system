import { NextRequest, NextResponse } from 'next/server';
import { 
  getNaverConfig,
  getProductDetail,
  extractOptionNames,
} from '@/lib/naver';

interface RouteParams {
  params: Promise<{
    originProductNo: string;
  }>;
}

/**
 * GET /api/naver/products/[originProductNo]
 * 
 * 네이버 상품 상세 조회 (옵션 정보 포함)
 * 
 * @param originProductNo - 원상품 번호
 * @returns 상품 상세 정보 + 옵션명 목록
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { originProductNo } = await params;
    const productNo = parseInt(originProductNo, 10);
    
    if (isNaN(productNo)) {
      return NextResponse.json(
        { error: 'Invalid originProductNo' },
        { status: 400 }
      );
    }
    
    const config = getNaverConfig();
    const detail = await getProductDetail(config, productNo);
    
    // 옵션명 추출
    const optionNames = extractOptionNames(detail);
    
    // 상품명 추출
    const productName = detail.smartstoreChannelProduct?.name 
      || detail.originProduct?.name 
      || '';
    
    // 옵션 그룹명 추출 (예: "색상", "사이즈")
    const optionGroupNames = detail.originProduct?.detailAttribute?.optionInfo?.optionCombinationGroupNames;
    
    return NextResponse.json({
      code: 'SUCCESS',
      message: 'OK',
      data: {
        originProductNo: productNo,
        productName,
        optionNames,
        optionGroupNames: {
          group1: optionGroupNames?.optionGroupName1 || null,
          group2: optionGroupNames?.optionGroupName2 || null,
          group3: optionGroupNames?.optionGroupName3 || null,
          group4: optionGroupNames?.optionGroupName4 || null,
        },
        // 전체 옵션 조합 정보 (필요시)
        optionCombinations: detail.originProduct?.detailAttribute?.optionInfo?.optionCombinations?.map(combo => ({
          id: combo.id,
          optionName1: combo.optionName1 || null,
          optionName2: combo.optionName2 || null,
          optionName3: combo.optionName3 || null,
          optionName4: combo.optionName4 || null,
          stockQuantity: combo.stockQuantity,
          price: combo.price,
          usable: combo.usable,
        })) || [],
        // 단순 옵션 정보 (필요시)
        simpleOptions: detail.originProduct?.detailAttribute?.optionInfo?.optionSimple?.map(group => ({
          groupName: group.groupName || null,
          options: group.optionList?.map(opt => opt.optionValue) || [],
        })) || [],
      },
    });
  } catch (error) {
    console.error('Naver Product Detail API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
