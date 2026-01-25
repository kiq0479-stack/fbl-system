import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { InboundRequest, InboundItem } from '@/types/database';

// GET: 입고 목록 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');

    let query = supabase
      .from('inbound_requests')
      .select(`
        *,
        items:inbound_items(*)
      `)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('Inbound GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST: 입고 등록
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      request_number,
      vendor_id,
      vendor_name,
      warehouse_name,
      expected_date,
      notes,
      items,
    }: {
      request_number: string;
      vendor_id: string;
      vendor_name: string;
      warehouse_name: string;
      expected_date: string;
      notes?: string;
      items: Array<{
        pallet_number: number;
        sku: string;
        product_name: string;
        box_quantity: number;
        quantity: number;
        vendor_item_id?: number;
      }>;
    } = body;

    // 총계 계산
    const total_pallets = Math.max(...items.map(i => i.pallet_number));
    const total_boxes = items.reduce((sum, i) => sum + i.box_quantity, 0);
    const total_quantity = items.reduce((sum, i) => sum + i.quantity, 0);

    // 입고 요청 생성
    const { data: inboundRequest, error: requestError } = await (supabase
      .from('inbound_requests') as any)
      .insert({
        request_number,
        vendor_id,
        vendor_name,
        warehouse_name,
        expected_date,
        notes,
        total_pallets,
        total_boxes,
        total_quantity,
        status: 'pending',
      })
      .select()
      .single();

    if (requestError) throw requestError;

    // 입고 품목 생성
    const itemsToInsert = items.map(item => ({
      inbound_request_id: inboundRequest.id,
      pallet_number: item.pallet_number,
      sku: item.sku,
      product_name: item.product_name,
      box_quantity: item.box_quantity,
      quantity: item.quantity,
      vendor_item_id: item.vendor_item_id || null,
    }));

    const { error: itemsError } = await (supabase
      .from('inbound_items') as any)
      .insert(itemsToInsert);

    if (itemsError) throw itemsError;

    return NextResponse.json({
      success: true,
      data: inboundRequest,
      message: '입고 요청이 등록되었습니다.',
    });
  } catch (error) {
    console.error('Inbound POST Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
