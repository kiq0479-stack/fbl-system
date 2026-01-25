-- 입고 관리 테이블
-- 생성일: 2026-01-24

-- ============================================
-- ENUM 타입 추가
-- ============================================

CREATE TYPE inbound_status AS ENUM ('pending', 'in_transit', 'arrived', 'completed', 'cancelled');

-- ============================================
-- 입고 요청 테이블
-- ============================================

-- 입고 요청 (적재리스트 단위)
CREATE TABLE inbound_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number VARCHAR(50) UNIQUE NOT NULL,  -- 입고요청서번호 (쿠팡 기준)
    status inbound_status DEFAULT 'pending',
    warehouse_name VARCHAR(100) NOT NULL,         -- 납품센터명 (천안1 센터 등)
    expected_date DATE NOT NULL,                  -- 도착예정일자
    total_pallets INT DEFAULT 0,                  -- 총 팔레트 수
    total_boxes INT DEFAULT 0,                    -- 총 박스 수
    total_quantity INT DEFAULT 0,                 -- 총 수량
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 입고 품목 (팔레트별 상품)
CREATE TABLE inbound_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inbound_request_id UUID REFERENCES inbound_requests(id) ON DELETE CASCADE,
    pallet_number INT NOT NULL,                   -- 팔레트 번호
    sku VARCHAR(100) NOT NULL,                    -- 상품번호 (쿠팡 SKU)
    product_name VARCHAR(255) NOT NULL,           -- 상품명 + 옵션명
    box_quantity INT NOT NULL,                    -- 박스 수량
    quantity INT NOT NULL,                        -- 총 수량
    vendor_item_id BIGINT,                        -- 쿠팡 vendorItemId (재고현황 연동용)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 인덱스
-- ============================================

CREATE INDEX idx_inbound_requests_status ON inbound_requests(status);
CREATE INDEX idx_inbound_requests_expected_date ON inbound_requests(expected_date);
CREATE INDEX idx_inbound_items_request ON inbound_items(inbound_request_id);
CREATE INDEX idx_inbound_items_sku ON inbound_items(sku);
CREATE INDEX idx_inbound_items_vendor_item_id ON inbound_items(vendor_item_id);

-- ============================================
-- 트리거
-- ============================================

CREATE TRIGGER tr_inbound_requests_updated_at
    BEFORE UPDATE ON inbound_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_inbound_items_updated_at
    BEFORE UPDATE ON inbound_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS
-- ============================================

ALTER TABLE inbound_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_items ENABLE ROW LEVEL SECURITY;

-- 개발용 전체 접근
CREATE POLICY "Allow all access" ON inbound_requests FOR ALL USING (true);
CREATE POLICY "Allow all access" ON inbound_items FOR ALL USING (true);
