-- 입고 요청에 업체 정보 추가
-- 생성일: 2026-01-24

-- vendor_id, vendor_name 컬럼 추가
ALTER TABLE inbound_requests 
ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(100);

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_inbound_requests_vendor ON inbound_requests(vendor_id);
