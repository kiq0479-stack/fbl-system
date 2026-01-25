import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// 엑셀 상품명 -> DB 상품명 매핑
const productNameMapping: Record<string, string> = {
  '베이직 3단': '키들 장난감 정리함 인형 교구장 베이직 3단',
  '베이직 3단 + 책장': '키들 장난감 정리함 인형 교구장 베이직+책장 3단',
  '베이직 4단 + 책장': '키들 장난감 정리함 인형 교구장 베이직+책장 4단',
  '베이직 4단': '키들 장난감 정리함 인형 교구장 베이직 4단',
  '전면책장 책꽂이': '키들 아기 전면 책장 책꽂이 3단 화이트 대',
  '옷장': '키들 아기 옷장 서랍장 행거 화이트',
  '2단 계단 브라운': '키들 아기 2단 계단 디딤대 1개 브라운',
  '2단 계단 화이트': '키들 아기 2단 계단 디딤대 1개 화이트',
  '3단 계단 화이트': '키들 아기 3단 계단 디딤대 1개 화이트',
  '3단 계단 브라운': '키들 아기 3단 계단 디딤대 1개 브라운',
  '흔들말 그린': '키들 아기 흔들말 붕붕카 스프링카 1개 베이지그린',
  '흔들말 브라운': '키들 아기 흔들말 붕붕카 스프링카 1개 베이지브라운',
  '기저귀 갈이대': '키들 아기 기저귀 갈이대 교환대 단일상품',
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 엑셀 파일 읽기
    const filePath = path.join('C:', 'Users', 'user', 'Downloads', 'FBL 물류.xlsx');
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: `파일을 찾을 수 없습니다: ${filePath}` }, { status: 404 });
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets['재고표'];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    // 상품 목록 조회
    const { data: products } = await supabase
      .from('products')
      .select('id, name, sku');

    if (!products) {
      return NextResponse.json({ error: '상품 목록을 가져올 수 없습니다.' }, { status: 500 });
    }

    // 상품명 -> 상품 ID 매핑
    const productByName = new Map<string, { id: string; sku: string }>();
    products.forEach(p => {
      productByName.set(p.name, { id: p.id, sku: p.sku });
    });

    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const results: any[] = [];
    const processedSkus = new Set<string>();  // 중복 방지

    // 키들 섹션 찾기 (첫 번째 "키들" 행 다음부터 빈 행까지)
    let kidlStart = -1;
    let kidlEnd = -1;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (row && row[0] === '키들' && kidlStart === -1) {
        kidlStart = i + 1;
      } else if (kidlStart !== -1 && kidlEnd === -1) {
        if (!row || !row[0] || row[0] === '쉴트' || row[0] === '발주표') {
          kidlEnd = i;
          break;
        }
      }
    }

    console.log(`키들 섹션: ${kidlStart} ~ ${kidlEnd}`);

    // 키들 상품 처리 (첫 번째 섹션만)
    for (let i = kidlStart; i < kidlEnd && i < data.length; i++) {
      const row = data[i];
      if (!row || !row[0]) continue;
      
      const excelName = String(row[0]).trim();
      const warehouseQty = Number(row[3]) || 0;  // D열: 창고 재고
      const palletCount = Number(row[6]) || 0;   // G열 (index 6): 창고 파렛트
      const extraBoxes = Number(row[7]) || 0;    // H열 (index 7): 창고 남은박스
      const palletQty = Number(row[9]) || null;  // J열: 파렛트 당 박스 수량
      
      if (!excelName) continue;

      // 엑셀 상품명 -> DB 상품명 매핑
      const dbProductName = productNameMapping[excelName];
      if (!dbProductName) {
        console.log(`매핑 없음: ${excelName}`);
        skippedCount++;
        continue;
      }

      const product = productByName.get(dbProductName);
      if (!product) {
        console.log(`상품 없음: ${dbProductName}`);
        skippedCount++;
        continue;
      }

      // 이미 처리한 상품은 스킵 (중복 방지)
      if (processedSkus.has(product.sku)) {
        continue;
      }
      processedSkus.add(product.sku);

      // 상품 테이블에 파렛트당 박스 수량 업데이트
      if (palletQty) {
        await supabase
          .from('products')
          .update({ pallet_qty: palletQty })
          .eq('id', product.id);
      }

      // 기존 창고 재고 조회
      const { data: existing } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('product_id', product.id)
        .eq('location', 'warehouse')
        .single();

      if (existing) {
        // 업데이트
        await supabase
          .from('inventory')
          .update({ 
            quantity: warehouseQty, 
            pallet_count: palletCount,
            extra_boxes: extraBoxes,
            updated_at: new Date().toISOString() 
          })
          .eq('id', existing.id);
        updatedCount++;
        results.push({ name: excelName, action: 'updated', qty: warehouseQty, palletCount, extraBoxes, palletQty });
      } else {
        // 추가
        await supabase
          .from('inventory')
          .insert({
            product_id: product.id,
            location: 'warehouse',
            quantity: warehouseQty,
            pallet_count: palletCount,
            extra_boxes: extraBoxes,
          });
        addedCount++;
        results.push({ name: excelName, action: 'added', qty: warehouseQty, palletCount, extraBoxes, palletQty });
      }
    }

    return NextResponse.json({
      success: true,
      message: `창고 재고 가져오기 완료: 추가 ${addedCount}개, 업데이트 ${updatedCount}개, 스킵 ${skippedCount}개`,
      added: addedCount,
      updated: updatedCount,
      skipped: skippedCount,
      results,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
