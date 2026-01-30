import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy 초기화 (빌드 타임에 throw 방지)
let _supabase: SupabaseClient | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

// POST: 외부 상품명으로 내부 상품 매핑 찾기
// 네이버 주문의 상품명으로 내부 상품을 찾을 때 사용
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { marketplace, external_product_name, external_product_id } = body;
    
    if (!marketplace) {
      return NextResponse.json(
        { error: 'marketplace가 필요합니다' }, 
        { status: 400 }
      );
    }
    
    // 1. 먼저 external_product_id로 정확히 매칭 시도
    if (external_product_id) {
      const { data: exactMatch } = await getSupabase()
        .from('product_mappings')
        .select('*, products(id, name, sku)')
        .eq('marketplace', marketplace)
        .eq('external_product_id', external_product_id)
        .eq('is_active', true)
        .single();
      
      if (exactMatch) {
        return NextResponse.json({ 
          mapping: exactMatch,
          match_type: 'exact_id'
        });
      }
    }
    
    // 2. external_product_name으로 매칭 시도
    if (external_product_name) {
      const { data: nameMatch } = await getSupabase()
        .from('product_mappings')
        .select('*, products(id, name, sku)')
        .eq('marketplace', marketplace)
        .eq('external_product_name', external_product_name)
        .eq('is_active', true)
        .single();
      
      if (nameMatch) {
        return NextResponse.json({ 
          mapping: nameMatch,
          match_type: 'exact_name'
        });
      }
      
      // 3. 상품명 부분 매칭 (ILIKE)
      const { data: partialMatches } = await getSupabase()
        .from('product_mappings')
        .select('*, products(id, name, sku)')
        .eq('marketplace', marketplace)
        .eq('is_active', true)
        .ilike('external_product_name', `%${external_product_name.substring(0, 20)}%`);
      
      if (partialMatches && partialMatches.length > 0) {
        return NextResponse.json({ 
          mapping: partialMatches[0],
          match_type: 'partial_name',
          candidates: partialMatches
        });
      }
    }
    
    // 매핑을 찾지 못함
    return NextResponse.json({ 
      mapping: null,
      match_type: 'none'
    });
  } catch (error) {
    console.error('매핑 검색 에러:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
