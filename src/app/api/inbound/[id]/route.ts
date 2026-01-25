import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET: 입고 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('inbound_requests')
      .select(`
        *,
        items:inbound_items(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Inbound GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PATCH: 입고 수정 (상태 변경 또는 전체 정보 수정)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const body = await request.json();

    const { 
      status, 
      notes, 
      request_number,
      vendor_id,
      vendor_name,
      warehouse_name,
      expected_date,
      total_pallets,
      total_boxes,
      total_quantity,
      items 
    } = body;

    // 업데이트할 필드 구성
    const updateData: Record<string, any> = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (request_number) updateData.request_number = request_number;
    if (vendor_id) updateData.vendor_id = vendor_id;
    if (vendor_name !== undefined) updateData.vendor_name = vendor_name;
    if (warehouse_name) updateData.warehouse_name = warehouse_name;
    if (expected_date) updateData.expected_date = expected_date;
    if (total_pallets !== undefined) updateData.total_pallets = total_pallets;
    if (total_boxes !== undefined) updateData.total_boxes = total_boxes;
    if (total_quantity !== undefined) updateData.total_quantity = total_quantity;

    // inbound_requests 업데이트
    const { data, error } = await (supabase
      .from('inbound_requests') as any)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // items가 있으면 기존 items 삭제 후 새로 추가
    if (items && Array.isArray(items)) {
      // 기존 items 삭제
      await supabase
        .from('inbound_items')
        .delete()
        .eq('inbound_request_id', id);

      // 새 items 추가
      const itemsToInsert = items.map((item: any) => ({
        inbound_request_id: id,
        pallet_number: item.pallet_number || 1,
        sku: item.sku || '',
        product_name: item.product_name || '',
        box_quantity: item.box_quantity || 0,
        quantity: item.quantity || 0,
      }));

      if (itemsToInsert.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: itemsError } = await (supabase as any)
          .from('inbound_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }
    }

    return NextResponse.json({
      success: true,
      data,
      message: items ? '입고 정보가 수정되었습니다.' : '입고 상태가 변경되었습니다.',
    });
  } catch (error) {
    console.error('Inbound PATCH Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE: 입고 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from('inbound_requests')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '입고 요청이 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Inbound DELETE Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
