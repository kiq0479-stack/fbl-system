-- 매출내역 테이블 (로켓그로스 + 판매자배송 통합)
-- 이미 테이블이 존재하면 스킵

CREATE TABLE IF NOT EXISTS coupang_revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  sale_type TEXT NOT NULL, -- SALE, CANCEL 등
  sale_date DATE NOT NULL, -- 판매일
  recognition_date DATE NOT NULL, -- 매출인식일
  settlement_date DATE, -- 정산예정일
  items JSONB NOT NULL DEFAULT '[]', -- 상품 아이템 배열
  raw_data JSONB, -- 원본 API 응답
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, vendor_id)
);

-- 매출내역 인덱스
CREATE INDEX IF NOT EXISTS idx_coupang_revenues_order_id ON coupang_revenues(order_id);
CREATE INDEX IF NOT EXISTS idx_coupang_revenues_vendor_id ON coupang_revenues(vendor_id);
CREATE INDEX IF NOT EXISTS idx_coupang_revenues_sale_date ON coupang_revenues(sale_date);
CREATE INDEX IF NOT EXISTS idx_coupang_revenues_recognition_date ON coupang_revenues(recognition_date);
CREATE INDEX IF NOT EXISTS idx_coupang_revenues_settlement_date ON coupang_revenues(settlement_date);
