-- ============================================================================
-- naver_orders 테이블 생성
-- 네이버 스마트스토어 주문 데이터를 저장하여 forecast에서 결제일 기준 판매량 계산
-- ============================================================================

CREATE TABLE IF NOT EXISTS naver_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_order_id text UNIQUE NOT NULL,        -- 네이버 상품주문 고유 ID
  order_id text,                                 -- 주문 묶음 ID
  payment_date timestamptz,                      -- 결제일
  product_id uuid REFERENCES products(id) ON DELETE SET NULL, -- 우리 상품 매핑
  product_name text,                             -- 네이버 상품명
  product_option text,                           -- 네이버 옵션명
  quantity int DEFAULT 1,                        -- 수량
  total_payment_amount numeric,                  -- 결제금액
  channel_product_id text,                       -- 네이버 상품 번호
  status text,                                   -- 주문 상태 (PAYED, DELIVERING, etc.)
  account_name text,                             -- 계정명
  raw_data jsonb,                                -- 원본 데이터
  synced_at timestamptz DEFAULT now(),           -- 동기화 시각
  created_at timestamptz DEFAULT now()
);

-- 인덱스: 결제일 기준 조회 (forecast에서 사용)
CREATE INDEX IF NOT EXISTS idx_naver_orders_payment_date ON naver_orders(payment_date);

-- 인덱스: 상품 매핑 조회
CREATE INDEX IF NOT EXISTS idx_naver_orders_product_id ON naver_orders(product_id);

-- 인덱스: 주문 상태 필터
CREATE INDEX IF NOT EXISTS idx_naver_orders_status ON naver_orders(status);

-- 인덱스: 동기화 시각
CREATE INDEX IF NOT EXISTS idx_naver_orders_synced_at ON naver_orders(synced_at);

-- RLS (Row Level Security) - 서비스 키 사용하므로 disabled
ALTER TABLE naver_orders ENABLE ROW LEVEL SECURITY;

-- 서비스 역할 전체 접근
CREATE POLICY "Service role full access on naver_orders"
  ON naver_orders FOR ALL
  USING (true)
  WITH CHECK (true);

-- anon 역할 읽기 접근
CREATE POLICY "Anon read access on naver_orders"
  ON naver_orders FOR SELECT
  USING (true);
