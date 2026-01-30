import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Marketplace } from '@/types/database';

// 타입 정의 없이 Supabase 클라이언트 생성 (새 테이블용)
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

// GET: 매핑 목록 조회
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const marketplace = searchParams.get('marketplace') as Marketplace | null;
    const productId = searchParams.get('product_id');
    const includeProducts = searchParams.get('include_products') === 'true';
    
    let query = getSupabase()
      .from('product_mappings')
      .select(includeProducts 
        ? '*, products(id, name, sku, barcode)' 
        : '*'
      )
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (marketplace) {
      query = query.eq('marketplace', marketplace);
    }
    
    if (productId) {
      query = query.eq('product_id', productId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('매핑 조회 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ mappings: data || [] });
  } catch (error) {
    console.error('매핑 조회 에러:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: 매핑 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      product_id, 
      marketplace, 
      external_product_id, 
      external_product_name,
      external_option_id,
      external_option_name 
    } = body;
    
    if (!product_id || !marketplace) {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다: product_id, marketplace' }, 
        { status: 400 }
      );
    }
    
    // 중복 체크
    const { data: existing } = await getSupabase()
      .from('product_mappings')
      .select('id')
      .eq('marketplace', marketplace)
      .eq('external_product_id', external_product_id || '')
      .eq('external_option_id', external_option_id || '')
      .single();
    
    if (existing) {
      return NextResponse.json(
        { error: '이미 동일한 외부 상품 매핑이 존재합니다' }, 
        { status: 409 }
      );
    }
    
    const { data, error } = await getSupabase()
      .from('product_mappings')
      .insert({
        product_id,
        marketplace,
        external_product_id,
        external_product_name,
        external_option_id,
        external_option_name,
      })
      .select()
      .single();
    
    if (error) {
      console.error('매핑 생성 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ mapping: data }, { status: 201 });
  } catch (error) {
    console.error('매핑 생성 에러:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: 매핑 수정
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    
    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });
    }
    
    const { data, error } = await getSupabase()
      .from('product_mappings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('매핑 수정 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ mapping: data });
  } catch (error) {
    console.error('매핑 수정 에러:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: 매핑 삭제 (soft delete)
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });
    }
    
    const { error } = await getSupabase()
      .from('product_mappings')
      .update({ is_active: false })
      .eq('id', id);
    
    if (error) {
      console.error('매핑 삭제 에러:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('매핑 삭제 에러:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
