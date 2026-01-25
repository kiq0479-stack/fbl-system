-- 시스템 사용자 테이블
CREATE TABLE IF NOT EXISTS system_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'logistics', 'marketing', 'finance', 'analytics')),
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6개 기본 계정 생성 (비밀번호는 간단하게 설정 - 내부용)
INSERT INTO system_users (username, password, role, name) VALUES
  ('admin', 'fbl2025!', 'admin', '대표'),
  ('manager', 'fbl2025!', 'manager', '팀장'),
  ('logistics', 'fbl2025!', 'logistics', '물류담당'),
  ('marketing', 'fbl2025!', 'marketing', '마케팅담당'),
  ('finance', 'fbl2025!', 'finance', '회계담당'),
  ('analytics', 'fbl2025!', 'analytics', '분석담당')
ON CONFLICT (username) DO NOTHING;

-- RLS 비활성화 (내부 시스템용)
ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;

-- 모든 인증된 요청에서 읽기 허용
CREATE POLICY "Allow read for all" ON system_users
  FOR SELECT USING (true);
