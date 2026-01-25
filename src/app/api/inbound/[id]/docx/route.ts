import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { 
  Document, 
  Packer, 
  Paragraph, 
  Table, 
  TableRow, 
  TableCell, 
  TextRun, 
  WidthType, 
  AlignmentType, 
  BorderStyle,
  VerticalAlign,
  PageOrientation,
  convertInchesToTwip,
} from 'docx';

// 테두리 스타일 공통
const borders = {
  top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
};

// 팔레트별로 그룹화된 적재리스트 docx 생성
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // 입고 요청 및 품목 조회
    const { data: inbound, error } = await supabase
      .from('inbound_requests')
      .select(`
        *,
        items:inbound_items(*)
      `)
      .eq('id', id)
      .single();

    if (error || !inbound) {
      return NextResponse.json({ error: '입고 요청을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 타입 단언
    const inboundData = inbound as any;

    // 날짜 포맷
    const expectedDate = new Date(inboundData.expected_date);
    const dateStr = `${String(expectedDate.getMonth() + 1).padStart(2, '0')}월${String(expectedDate.getDate()).padStart(2, '0')}일`;

    // 팔레트별로 그룹화
    const palletGroups: Record<number, any[]> = {};
    (inboundData.items || []).forEach((item: any) => {
      if (!palletGroups[item.pallet_number]) {
        palletGroups[item.pallet_number] = [];
      }
      palletGroups[item.pallet_number].push(item);
    });

    const totalPallets = Object.keys(palletGroups).length;
    const sections: any[] = [];

    // 각 팔레트별로 페이지 생성
    Object.entries(palletGroups).forEach(([palletNum, items], index) => {
      const palletItems = items as any[];
      const totalBoxes = palletItems.reduce((sum, item) => sum + item.box_quantity, 0);

      // 메인 테이블 (전체를 감싸는 테이블)
      const mainTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          // Row 1: 제목
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: '쿠팡 팔레트 적재리스트(필수작성)', bold: true, size: 32 }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 200, after: 200 },
                  }),
                ],
                borders,
                columnSpan: 6,
                verticalAlign: VerticalAlign.CENTER,
              }),
            ],
          }),
          // Row 2: 팔레트 정보
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: `총 팔레트 수 - 해당 팔레트 번호( ${totalPallets} - ${palletNum} )/ 박스수량. ( ${totalBoxes} BOX )`, size: 26 }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 200, after: 200 },
                  }),
                ],
                borders,
                columnSpan: 6,
                verticalAlign: VerticalAlign.CENTER,
              }),
            ],
          }),
          // Row 3: 물류센터 정보
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: `물류센터 도착예정일자. ( ${dateStr} ) / 납품센터명. ( ${inboundData.warehouse_name} )`, size: 26 }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 200, after: 200 },
                  }),
                ],
                borders,
                columnSpan: 6,
                verticalAlign: VerticalAlign.CENTER,
              }),
            ],
          }),
          // Row 4: 업체명 / 입고요청서번호
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: `업체명 (주식회사 컴팩트우디) / 입고요청서번호 ( ${inboundData.request_number} )`, size: 24 }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 150, after: 150 },
                  }),
                ],
                borders,
                columnSpan: 6,
                verticalAlign: VerticalAlign.CENTER,
              }),
            ],
          }),
          // Row 5: 테이블 헤더
          new TableRow({
            children: [
              createHeaderCell('NO', 8),
              createHeaderCell('거래명세서의\n상품번호', 20),
              createHeaderCell('물류 입고용 상품명 +\n옵션명', 35),
              createHeaderCell('BOX\n수량', 12),
              createHeaderCell('수량', 12),
              createHeaderCell('유통기한\n/제조일자', 13),
            ],
          }),
          // 데이터 행들
          ...palletItems.map((item, idx) => 
            new TableRow({
              children: [
                createDataCell(String(idx + 1), 8),
                createDataCell(item.sku, 20),
                createDataCell(item.product_name, 35),
                createDataCell(String(item.box_quantity), 12),
                createDataCell(String(item.quantity), 12),
                createDataCell('', 13),
              ],
            })
          ),
        ],
      });

      sections.push({
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: convertInchesToTwip(0.5),
              right: convertInchesToTwip(0.5),
              bottom: convertInchesToTwip(0.5),
              left: convertInchesToTwip(0.5),
            },
          },
        },
        children: [mainTable],
      });
    });

    // Document 생성
    const doc = new Document({
      sections: sections,
    });

    // Buffer로 변환
    const buffer = await Packer.toBuffer(doc);

    // 파일명 생성
    const filename = `${dateStr.replace('월', '').replace('일', '')} ${inboundData.warehouse_name.replace(' 센터', '')} 적재리스트.docx`;

    // Buffer를 Uint8Array로 변환
    const uint8Array = new Uint8Array(buffer);

    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    console.error('DOCX Generation Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// 헤더 셀 생성 헬퍼
function createHeaderCell(text: string, widthPercent: number) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 100 },
      }),
    ],
    borders,
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
  });
}

// 데이터 셀 생성 헬퍼
function createDataCell(text: string, widthPercent: number) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 150, after: 150 },
      }),
    ],
    borders,
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
  });
}
