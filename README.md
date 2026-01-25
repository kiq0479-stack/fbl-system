# FBL 통합 업무 시스템

쿠팡 로켓그로스 + 판매자 배송 물류 관리 시스템

## 개요

- **도메인**: https://fblsystem.com
- **기술 스택**: Next.js 14, TypeScript, Supabase, Tailwind CSS
- **배포**: Vercel
- **프록시 서버**: AWS EC2 (고정 IP: 43.203.14.73)

## 주요 기능

### 쿠팡 연동
- 로켓그로스 재고 조회 및 동기화
- 주문 목록 조회 (로켓그로스 + 판매자배송)
- 매출/정산 내역 조회
- 취소/반품 요청 조회

### 상품 관리
- 쿠팡 상품 동기화
- 재고 현황 관리
- 입고 요청 관리

### 멀티 계정 지원
- 컴팩트우디 (기본 계정)
- 쉴트 (2번째 계정)
- 추가 계정 확장 가능

---

## 프로젝트 구조

```
src/
├── app/
│   ├── api/                    # API Routes
│   │   ├── coupang/           # 쿠팡 API
│   │   │   ├── accounts/      # 계정 목록 조회
│   │   │   ├── orders/        # 판매자배송 주문
│   │   │   ├── rocket/        # 로켓그로스 API
│   │   │   │   ├── inventory/ # 재고 조회
│   │   │   │   ├── orders/    # 주문 조회
│   │   │   │   └── sync/      # 주문 동기화
│   │   │   ├── revenue/       # 매출내역
│   │   │   ├── stock-summary/ # 재고 요약
│   │   │   └── sync/          # 주문 동기화
│   │   ├── inventory/         # 재고 관리 API
│   │   │   └── sync-coupang/  # 쿠팡 재고 동기화
│   │   ├── products/          # 상품 관리 API
│   │   │   └── sync-coupang/  # 쿠팡 상품 동기화
│   │   └── settings/          # 설정 API
│   │       └── api-status/    # API 연결 상태
│   │
│   ├── (dashboard)/           # 대시보드 페이지들
│   │   ├── products/          # 상품 관리
│   │   ├── inventory/         # 재고 관리
│   │   ├── coupang/           # 쿠팡 주문
│   │   └── settings/          # 설정
│   │
│   └── page.tsx               # 메인 페이지
│
├── components/                # 공통 컴포넌트
│   └── ui/                    # shadcn/ui 컴포넌트
│
└── lib/
    ├── coupang.ts             # ⭐ 쿠팡 API 클라이언트 (핵심 파일)
    ├── supabase/              # Supabase 클라이언트
    └── utils.ts               # 유틸리티 함수
```

---

## 환경 변수

### 필수 환경변수 (.env.local)

```bash
# ─────────────────────────────────────────────────────────────────────────────
# Supabase
# ─────────────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...      # (선택) RLS 우회용

# ─────────────────────────────────────────────────────────────────────────────
# 쿠팡 API - 계정 1 (컴팩트우디)
# ─────────────────────────────────────────────────────────────────────────────
COUPANG_VENDOR_ID=A01241550
COUPANG_ACCESS_KEY=50eed9a9-xxxx-xxxx-xxxx-xxxxxxxxxxxx
COUPANG_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ─────────────────────────────────────────────────────────────────────────────
# 쿠팡 API - 계정 2 (쉴트)
# ─────────────────────────────────────────────────────────────────────────────
COUPANG_VENDOR_ID_2=A01207048
COUPANG_ACCESS_KEY_2=9575499c-xxxx-xxxx-xxxx-xxxxxxxxxxxx
COUPANG_SECRET_KEY_2=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ─────────────────────────────────────────────────────────────────────────────
# 프록시 서버 (쿠팡 IP 화이트리스트용)
# ─────────────────────────────────────────────────────────────────────────────
PROXY_URL=http://43.203.14.73:8888
```

### Vercel 환경변수 설정

Vercel Dashboard > Settings > Environment Variables에서 위 변수들 모두 추가

---

## 쿠팡 API 연동 가이드

### 1. IP 화이트리스트 등록

쿠팡 Open API는 IP 화이트리스트 방식. 각 계정별로 프록시 서버 IP 등록 필요.

1. [쿠팡 Wing](https://wing.coupang.com) 로그인
2. 판매자 정보 관리 > Open API 인증키 관리
3. 허용 IP 추가: `43.203.14.73`

### 2. 프록시 서버 정보

- **인스턴스**: fbl-proxy-server (AWS EC2)
- **고정 IP**: 43.203.14.73 (Elastic IP)
- **포트**: 8888
- **소프트웨어**: TinyProxy

### 3. 계정 추가 방법

새 쿠팡 계정 추가시:

1. Vercel에 환경변수 추가:
   ```
   COUPANG_VENDOR_ID_3=A0xxxxxxx
   COUPANG_ACCESS_KEY_3=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   COUPANG_SECRET_KEY_3=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

2. `src/lib/coupang.ts`의 `getCoupangAccounts()` 함수에 계정 추가:
   ```typescript
   // 계정 3: 새 계정명
   const vendorId3 = process.env.COUPANG_VENDOR_ID_3;
   const accessKey3 = process.env.COUPANG_ACCESS_KEY_3;
   const secretKey3 = process.env.COUPANG_SECRET_KEY_3;
   
   if (vendorId3 && accessKey3 && secretKey3) {
     accounts.push({
       id: '3',
       name: '새 계정명',
       vendorId: vendorId3,
       accessKey: accessKey3,
       secretKey: secretKey3,
     });
   }
   ```

3. 쿠팡 Wing에서 새 계정의 허용 IP에 `43.203.14.73` 등록

---

## API 엔드포인트

### 쿠팡 API

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/coupang/accounts` | GET | 등록된 쿠팡 계정 목록 |
| `/api/coupang/stock-summary` | GET | 재고 요약 (모든 계정 병합) |
| `/api/coupang/rocket/orders?from=&to=` | GET | 로켓그로스 주문 |
| `/api/coupang/rocket/inventory` | GET | 로켓그로스 재고 |
| `/api/coupang/orders?from=&to=` | GET | 판매자배송 주문 |
| `/api/coupang/revenue?from=&to=` | GET | 매출내역 |

### 동기화 API

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/products/sync-coupang` | POST | 쿠팡 상품 동기화 |
| `/api/inventory/sync-coupang` | POST | 쿠팡 재고 동기화 |

### 설정 API

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/settings/api-status` | GET | API 연결 상태 확인 |

---

## 개발 환경 설정

### 1. 의존성 설치

```bash
cd web
npm install
```

### 2. 환경변수 설정

`.env.local` 파일 생성 후 위 환경변수 설정

### 3. 개발 서버 실행

```bash
npm run dev
```

http://localhost:3000 접속

### 4. 빌드

```bash
npm run build
```

---

## 주요 파일 설명

### `src/lib/coupang.ts`

쿠팡 API 클라이언트 핵심 파일.

- **인증**: HMAC-SHA256 서명 방식 (CEA)
- **프록시**: PROXY_URL 환경변수로 설정
- **멀티계정**: `getCoupangAccounts()` 함수로 모든 계정 조회

주요 함수:
- `getCoupangAccounts()` - 등록된 모든 계정 조회
- `getRocketGrowthInventory()` - 로켓그로스 재고 조회
- `getRocketGrowthOrders()` - 로켓그로스 주문 조회
- `getRevenueHistory()` - 매출내역 조회

### API 라우트 패턴

멀티계정을 지원하는 API 패턴:

```typescript
import { getCoupangAccounts } from '@/lib/coupang';

export async function GET() {
  const accounts = getCoupangAccounts();
  
  // 모든 계정에서 병렬로 데이터 조회
  const results = await Promise.all(
    accounts.map(async (account) => {
      const config = {
        vendorId: account.vendorId,
        accessKey: account.accessKey,
        secretKey: account.secretKey,
      };
      
      // API 호출...
    })
  );
  
  // 결과 병합
  const mergedData = results.flat();
  
  return NextResponse.json({ data: mergedData });
}
```

---

## 트러블슈팅

### 쿠팡 API 403 에러

- 프록시 서버 IP가 쿠팡 Wing에 등록되어 있는지 확인
- 각 계정별로 IP 등록 필요

### 환경변수 인식 안됨

- Vercel 환경변수 추가 후 **Redeploy** 필요
- 로컬에서는 `.env.local` 파일 확인

### 상품 동기화 타임아웃

- Vercel 무료 플랜은 10초 제한
- Pro 플랜 또는 Edge Function 사용 고려

---

## 배포

### Vercel 자동 배포

GitHub `master` 브랜치에 push하면 자동 배포됨.

```bash
git add .
git commit -m "feat: 기능 추가"
git push origin master
```

### 수동 배포

```bash
npx vercel --prod
```

---

## 연락처

- **GitHub**: https://github.com/kiq0479-stack/fbl-system
- **도메인**: https://fblsystem.com
