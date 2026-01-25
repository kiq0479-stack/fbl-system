-- 쿠팡 주문 상태 enum
CREATE TYPE coupang_order_status AS ENUM ('ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY');

-- 쿠팡 주문 테이블
CREATE TABLE coupang_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_box_id BIGINT NOT NULL UNIQUE,
  order_id BIGINT NOT NULL,
  ordered_at TIMESTAMPTZ NOT NULL,
  orderer_name TEXT NOT NULL,
  orderer_phone TEXT,
  receiver_name TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  receiver_addr1 TEXT NOT NULL,
  receiver_addr2 TEXT,
  receiver_zip_code TEXT NOT NULL,
  status coupang_order_status NOT NULL,
  paid_at TIMESTAMPTZ,
  shipping_price INTEGER,
  remote_area_price INTEGER,
  parcel_print_message TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 쿠팡 주문 아이템 테이블
CREATE TABLE coupang_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupang_order_id UUID NOT NULL REFERENCES coupang_orders(id) ON DELETE CASCADE,
  vendor_item_id BIGINT NOT NULL,
  vendor_item_name TEXT NOT NULL,
  shipping_count INTEGER NOT NULL,
  sales_price INTEGER NOT NULL,
  order_price INTEGER NOT NULL,
  discount_price INTEGER,
  external_vendor_sku_code TEXT,
  seller_product_id BIGINT NOT NULL,
  seller_product_name TEXT NOT NULL,
  seller_product_item_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_coupang_orders_order_id ON coupang_orders(order_id);
CREATE INDEX idx_coupang_orders_status ON coupang_orders(status);
CREATE INDEX idx_coupang_orders_ordered_at ON coupang_orders(ordered_at);
CREATE INDEX idx_coupang_order_items_order_id ON coupang_order_items(coupang_order_id);
CREATE INDEX idx_coupang_order_items_vendor_item_id ON coupang_order_items(vendor_item_id);

-- RLS 정책 (필요시 활성화)
-- ALTER TABLE coupang_orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE coupang_order_items ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 로켓그로스 테이블
-- ========================================

-- 로켓그로스 주문 테이블
CREATE TABLE rocket_growth_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL UNIQUE,
  order_status TEXT NOT NULL,
  ordered_at TIMESTAMPTZ NOT NULL,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  receiver_name TEXT NOT NULL,
  receiver_phone TEXT,
  receiver_address TEXT,
  receiver_post_code TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 로켓그로스 주문 아이템 테이블
CREATE TABLE rocket_growth_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rocket_growth_order_id UUID NOT NULL REFERENCES rocket_growth_orders(id) ON DELETE CASCADE,
  vendor_item_id TEXT NOT NULL,
  vendor_item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  sales_price INTEGER NOT NULL,
  discount_price INTEGER DEFAULT 0,
  seller_product_id TEXT NOT NULL,
  seller_product_name TEXT NOT NULL,
  external_vendor_sku_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 로켓그로스 인덱스
CREATE INDEX idx_rocket_growth_orders_order_id ON rocket_growth_orders(order_id);
CREATE INDEX idx_rocket_growth_orders_status ON rocket_growth_orders(order_status);
CREATE INDEX idx_rocket_growth_orders_ordered_at ON rocket_growth_orders(ordered_at);
CREATE INDEX idx_rocket_growth_order_items_order_id ON rocket_growth_order_items(rocket_growth_order_id);
CREATE INDEX idx_rocket_growth_order_items_vendor_item_id ON rocket_growth_order_items(vendor_item_id);

-- ========================================
-- 매출내역 테이블 (로켓그로스 + 판매자배송 통합)
-- ========================================

CREATE TABLE coupang_revenues (
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
CREATE INDEX idx_coupang_revenues_order_id ON coupang_revenues(order_id);
CREATE INDEX idx_coupang_revenues_vendor_id ON coupang_revenues(vendor_id);
CREATE INDEX idx_coupang_revenues_sale_date ON coupang_revenues(sale_date);
CREATE INDEX idx_coupang_revenues_recognition_date ON coupang_revenues(recognition_date);
CREATE INDEX idx_coupang_revenues_settlement_date ON coupang_revenues(settlement_date);
