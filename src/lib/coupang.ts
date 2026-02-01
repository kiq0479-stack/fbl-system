/**
 * ============================================================================
 * 쿠팡 Open API 클라이언트
 * ============================================================================
 * 
 * 이 모듈은 쿠팡 Wing Open API와 통신하는 클라이언트입니다.
 * 
 * ## 주요 기능
 * - 로켓그로스 재고/주문 조회
 * - 판매자 배송 주문 조회
 * - 매출/정산 내역 조회
 * - 상품 목록/상세 조회
 * - 취소/반품 요청 조회
 * 
 * ## 멀티 계정 지원
 * 현재 2개 계정 지원:
 * - 계정1: 컴팩트우디 (COUPANG_VENDOR_ID, COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY)
 * - 계정2: 쉴트 (COUPANG_VENDOR_ID_2, COUPANG_ACCESS_KEY_2, COUPANG_SECRET_KEY_2)
 * 
 * ## 프록시 설정
 * 쿠팡 API는 IP 화이트리스트 방식이므로, 고정 IP 프록시 필요.
 * 환경변수: PROXY_URL=http://IP:PORT
 * 
 * ## API 호출 제한
 * - 대부분의 API: 분당 50회
 * - 조회 기간: 최대 30일
 * 
 * @see https://developers.coupangcorp.com/ 쿠팡 개발자 센터
 */

import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import nodeFetch from 'node-fetch';

// ============================================================================
// 상수 및 타입 정의
// ============================================================================

const COUPANG_API_URL = 'https://api-gateway.coupang.com';

/**
 * 쿠팡 API 인증 설정
 * @property vendorId - 판매자 ID (예: A01241550)
 * @property accessKey - API Access Key
 * @property secretKey - API Secret Key (HMAC 서명에 사용)
 */
export interface CoupangConfig {
  vendorId: string;
  accessKey: string;
  secretKey: string;
}

/**
 * 쿠팡 계정 정보 (멀티 계정 지원용)
 * @property id - 내부 식별자 ('1', '2', ...)
 * @property name - 계정 표시명 (예: '컴팩트우디', '쉴트')
 */
export interface CoupangAccount {
  id: string;
  name: string;
  vendorId: string;
  accessKey: string;
  secretKey: string;
}

// ============================================================================
// 내부 헬퍼 함수
// ============================================================================

/**
 * 프록시 에이전트 생성
 * 쿠팡 API는 IP 화이트리스트 방식이므로, 등록된 고정 IP에서만 호출 가능.
 * AWS EC2 프록시 서버를 통해 요청을 라우팅함.
 * 
 * @returns HttpsProxyAgent 또는 undefined (프록시 미설정시)
 */
function getProxyAgent(): HttpsProxyAgent<string> | undefined {
  const proxyUrl = process.env.PROXY_URL;
  if (proxyUrl) {
    return new HttpsProxyAgent(proxyUrl);
  }
  return undefined;
}

/**
 * HMAC-SHA256 서명 생성
 * 쿠팡 API 인증에 사용되는 서명 생성.
 * 
 * @param method - HTTP 메서드 (GET, POST 등)
 * @param path - API 경로 (/v2/providers/...)
 * @param query - 쿼리 스트링 (? 제외)
 * @param datetime - 서명 시간 (YYMMDDTHHMMSSZ 형식)
 * @param secretKey - Secret Key
 * @returns 16진수 서명 문자열
 * 
 * @example
 * // 서명 메시지 형식: datetime + method + path + query
 * // 예: "260125T130000ZGET/v2/providers/.../ordersvendorId=A01241550"
 */
function generateHmacSignature(
  method: string,
  path: string,
  query: string,
  datetime: string,
  secretKey: string
): string {
  const message = datetime + method + path + query;
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(message);
  return hmac.digest('hex');
}

/**
 * Authorization 헤더 생성
 * 쿠팡 CEA(Coupang Extended Authentication) 방식 인증 헤더 생성.
 * 
 * @returns "CEA algorithm=HmacSHA256, access-key=..., signed-date=..., signature=..."
 */
function getAuthorizationHeader(
  method: string,
  path: string,
  query: string,
  accessKey: string,
  secretKey: string
): string {
  // 시간 형식: YYMMDDTHHMMSSZ (예: 260125T130000Z)
  // 주의: toISOString()은 UTC 기준이므로 KST와 9시간 차이
  const datetime = new Date()
    .toISOString()
    .substr(2, 17)
    .replace(/[-:]/g, '') + 'Z';
  
  const signature = generateHmacSignature(method, path, query, datetime, secretKey);
  
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

// ============================================================================
// 핵심 API 요청 함수
// ============================================================================

/**
 * 쿠팡 API 요청 (범용)
 * 모든 쿠팡 API 호출의 기반 함수.
 * 
 * @template T - 응답 타입
 * @param method - HTTP 메서드
 * @param path - API 경로 (쿼리 스트링 포함 가능)
 * @param config - 인증 설정
 * @param body - POST/PUT 요청 바디
 * @returns API 응답
 * 
 * @throws Error - API 호출 실패시 (4xx, 5xx)
 * 
 * @example
 * const response = await coupangRequest<InventoryResponse>(
 *   'GET',
 *   '/v2/providers/.../inventory/summaries?vendorId=A01241550',
 *   config
 * );
 */
export async function coupangRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  config: CoupangConfig,
  body?: object
): Promise<T> {
  // path와 query string 분리 (서명 생성에 필요)
  const [basePath, queryString] = path.includes('?') 
    ? path.split('?') 
    : [path, ''];
  
  const authorization = getAuthorizationHeader(
    method,
    basePath,
    queryString,
    config.accessKey,
    config.secretKey
  );

  const headers: HeadersInit = {
    'Content-Type': 'application/json;charset=UTF-8',
    'Authorization': authorization,
  };

  const agent = getProxyAgent();

  // Per-request timeout (10s) to prevent indefinite hangs from proxy issues
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await nodeFetch(`${COUPANG_API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      agent,
      signal: controller.signal as any,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Coupang API Error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Coupang API Timeout: request to ${basePath} timed out after 10s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// 멀티 계정 관리
// ============================================================================

/**
 * 등록된 모든 쿠팡 계정 목록 조회
 * 
 * 계정 추가 방법:
 * 1. Vercel/로컬에 환경변수 추가 (COUPANG_VENDOR_ID_N, COUPANG_ACCESS_KEY_N, COUPANG_SECRET_KEY_N)
 * 2. 이 함수에 계정 로드 로직 추가
 * 3. 쿠팡 Wing에서 해당 계정의 허용 IP에 프록시 서버 IP 등록
 * 
 * @returns 계정 배열 (환경변수 설정된 계정만)
 */
export function getCoupangAccounts(): CoupangAccount[] {
  const accounts: CoupangAccount[] = [];
  
  // ─────────────────────────────────────────────────────────────────────────
  // 계정 1: 컴팩트우디 (기본 계정)
  // ─────────────────────────────────────────────────────────────────────────
  const vendorId1 = process.env.COUPANG_VENDOR_ID;
  const accessKey1 = process.env.COUPANG_ACCESS_KEY;
  const secretKey1 = process.env.COUPANG_SECRET_KEY;
  
  if (vendorId1 && accessKey1 && secretKey1) {
    accounts.push({
      id: '1',
      name: '컴팩트우디',
      vendorId: vendorId1,
      accessKey: accessKey1,
      secretKey: secretKey1,
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // 계정 2: 쉴트
  // ─────────────────────────────────────────────────────────────────────────
  const vendorId2 = process.env.COUPANG_VENDOR_ID_2;
  const accessKey2 = process.env.COUPANG_ACCESS_KEY_2;
  const secretKey2 = process.env.COUPANG_SECRET_KEY_2;
  
  if (vendorId2 && accessKey2 && secretKey2) {
    accounts.push({
      id: '2',
      name: '쉴트',
      vendorId: vendorId2,
      accessKey: accessKey2,
      secretKey: secretKey2,
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // 계정 3, 4, 5... (필요시 위와 같은 패턴으로 추가)
  // ─────────────────────────────────────────────────────────────────────────
  
  return accounts;
}

/**
 * 특정 계정 ID로 CoupangConfig 조회
 * 
 * @param accountId - 계정 ID ('1', '2', ...)
 * @returns CoupangConfig
 * @throws Error - 계정을 찾을 수 없을 때
 */
export function getCoupangConfigById(accountId: string): CoupangConfig {
  const accounts = getCoupangAccounts();
  const account = accounts.find(a => a.id === accountId);
  
  if (!account) {
    throw new Error(`Coupang account not found: ${accountId}`);
  }
  
  return {
    vendorId: account.vendorId,
    accessKey: account.accessKey,
    secretKey: account.secretKey,
  };
}

/**
 * 기본 계정(계정 1) Config 조회
 * 
 * @deprecated 멀티계정 지원 후 사용 자제. getCoupangAccounts() 사용 권장.
 * @returns CoupangConfig
 * @throws Error - 환경변수 미설정시
 */
export function getCoupangConfig(): CoupangConfig {
  const vendorId = process.env.COUPANG_VENDOR_ID;
  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;

  if (!vendorId || !accessKey || !secretKey) {
    throw new Error('Coupang API credentials not configured');
  }

  return { vendorId, accessKey, secretKey };
}

/**
 * CoupangAccount에서 CoupangConfig 추출 헬퍼
 * 
 * @param account - 계정 정보
 * @returns CoupangConfig
 */
export function accountToConfig(account: CoupangAccount): CoupangConfig {
  return {
    vendorId: account.vendorId,
    accessKey: account.accessKey,
    secretKey: account.secretKey,
  };
}

// ============================================================================
// 판매자 배송 주문 API
// ============================================================================

/**
 * 판매자 배송 주문 조회 응답 타입
 */
export interface CoupangOrderResponse {
  code: string;
  message: string;
  data: CoupangOrderSheet[];
  nextToken?: string;
}

export interface CoupangOrderSheet {
  shipmentBoxId: number;
  orderId: number;
  orderedAt: string;
  ordererName: string;
  ordererEmail: string;
  ordererPhone: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddr1: string;
  receiverAddr2: string;
  receiverZipCode: string;
  status: string;
  orderItems: CoupangOrderItem[];
}

export interface CoupangOrderItem {
  vendorItemId: number;
  vendorItemName: string;
  shippingCount: number;
  salesPrice: number;
  orderPrice: number;
  discountPrice: number;
  instantCouponDiscount: number;
  downloadableCouponDiscount: number;
  coupangDiscount: number;
  externalVendorSkuCode?: string;
  sellerProductId: number;
  sellerProductName: string;
  sellerProductItemName: string;
}

export interface CoupangOrderDetail extends CoupangOrderSheet {
  paidAt: string;
  shippingPrice: number;
  remoteAreaPrice: number;
  parcelPrintMessage: string;
}

/**
 * 판매자 배송 주문 조회
 * 
 * @param config - 인증 설정
 * @param options - 조회 옵션
 * @param options.vendorId - 판매자 ID
 * @param options.createdAtFrom - 시작일 (YYYY-MM-DD)
 * @param options.createdAtTo - 종료일 (YYYY-MM-DD)
 * @param options.status - 주문 상태 필터
 *   - ACCEPT: 결제완료
 *   - INSTRUCT: 상품준비중
 *   - DEPARTURE: 배송지시
 *   - DELIVERING: 배송중
 *   - FINAL_DELIVERY: 배송완료
 * 
 * @example
 * const orders = await getOrders(config, {
 *   vendorId: 'A01241550',
 *   createdAtFrom: '2026-01-01',
 *   createdAtTo: '2026-01-25',
 *   status: 'ACCEPT',
 * });
 */
export async function getOrders(
  config: CoupangConfig,
  options: {
    vendorId: string;
    createdAtFrom?: string;
    createdAtTo?: string;
    status?: string;
    maxPerPage?: number;
    nextToken?: string;
  }
) {
  const { vendorId, createdAtFrom, createdAtTo, status, maxPerPage = 50, nextToken } = options;
  
  let path = `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets`;
  
  const params = new URLSearchParams();
  if (createdAtFrom) params.append('createdAtFrom', createdAtFrom);
  if (createdAtTo) params.append('createdAtTo', createdAtTo);
  if (status) params.append('status', status);
  params.append('maxPerPage', maxPerPage.toString());
  if (nextToken) params.append('nextToken', nextToken);
  
  const queryString = params.toString();
  if (queryString) {
    path += `?${queryString}`;
  }

  return coupangRequest<CoupangOrderResponse>('GET', path, config);
}

/**
 * 판매자 배송 주문 상세 조회
 */
export async function getOrderDetail(
  config: CoupangConfig,
  vendorId: string,
  shipmentBoxId: number
) {
  const path = `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets/${shipmentBoxId}`;
  return coupangRequest<CoupangOrderDetail>('GET', path, config);
}

// ============================================================================
// 로켓그로스 API
// ============================================================================

/**
 * 로켓그로스 주문 응답 타입
 */
export interface RocketGrowthOrderResponse {
  code: number;
  message: string;
  data: RocketGrowthOrder[];
  nextToken?: string;
}

export interface RocketGrowthOrder {
  orderId: number;
  vendorId: string;
  /** 결제 시간 (Unix timestamp, 밀리초). 예: 1746093162000 */
  paidAt: number;
  orderItems: RocketGrowthOrderItem[];
}

export interface RocketGrowthOrderItem {
  vendorItemId: number;
  productName: string;
  salesQuantity: number;
  salesPrice: number;
  currency: string;
}

export interface RocketGrowthOrderDetailResponse {
  code: number;
  message: string;
  data: RocketGrowthOrder;
}

/**
 * 로켓그로스 재고 응답 타입
 */
export interface RocketGrowthInventoryResponse {
  code: string;  // "SUCCESS" 또는 "ERROR"
  message: string;
  data: RocketGrowthInventoryItem[];
  nextToken?: string;
}

export interface RocketGrowthInventoryItem {
  vendorId: string;
  vendorItemId: number;
  /** 외부 SKU ID (파렛트 적재 리스트 매칭용) */
  externalSkuId?: string;
  inventoryDetails: {
    /** 주문 가능 재고 수량 */
    totalOrderableQuantity: number;
  };
  salesCountMap: {
    /** 최근 30일 판매량 */
    SALES_COUNT_LAST_THIRTY_DAYS: number;
  };
}

/**
 * 로켓그로스 주문 조회
 * 
 * 주의사항:
 * - paidDateFrom/To는 yyyymmdd 형식 (예: 20260125)
 * - 최대 30일까지 조회 가능
 * - 분당 50회 호출 제한
 * - 취소된 주문도 포함됨 (정확한 매출은 매출내역 API 사용)
 * 
 * @param options.paidDateFrom - 결제일 시작 (yyyymmdd)
 * @param options.paidDateTo - 결제일 종료 (yyyymmdd)
 */
export async function getRocketGrowthOrders(
  config: CoupangConfig,
  options: {
    vendorId: string;
    paidDateFrom: string;
    paidDateTo: string;
    nextToken?: string;
  }
) {
  const { vendorId, paidDateFrom, paidDateTo, nextToken } = options;
  
  let path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${vendorId}/rg/orders`;
  
  const params = new URLSearchParams();
  params.append('paidDateFrom', paidDateFrom);
  params.append('paidDateTo', paidDateTo);
  if (nextToken) params.append('nextToken', nextToken);
  
  path += `?${params.toString()}`;

  return coupangRequest<RocketGrowthOrderResponse>('GET', path, config);
}

/**
 * 로켓그로스 주문 상세 조회
 */
export async function getRocketGrowthOrderDetail(
  config: CoupangConfig,
  vendorId: string,
  orderId: string
) {
  const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${vendorId}/rg/order/${orderId}`;
  return coupangRequest<RocketGrowthOrderDetailResponse>('GET', path, config);
}

/**
 * 로켓그로스 재고 요약 조회
 * 
 * 쿠팡 물류센터에 입고된 재고 현황 조회.
 * 
 * 주의사항:
 * - 분당 50회 호출 제한
 * - 페이지당 약 20개 반환
 * - 재고가 있는 상품만 반환됨
 * 
 * @param options.vendorItemId - 특정 상품만 조회 (선택)
 * @param options.nextToken - 페이지네이션 토큰
 */
export async function getRocketGrowthInventory(
  config: CoupangConfig,
  vendorId: string,
  options?: {
    vendorItemId?: string;
    nextToken?: string;
  }
) {
  let path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${vendorId}/rg/inventory/summaries`;
  
  const params = new URLSearchParams();
  if (options?.vendorItemId) params.append('vendorItemId', options.vendorItemId);
  if (options?.nextToken) params.append('nextToken', options.nextToken);
  
  const queryString = params.toString();
  if (queryString) {
    path += `?${queryString}`;
  }
  
  return coupangRequest<RocketGrowthInventoryResponse>('GET', path, config);
}

// ============================================================================
// 매출/정산 API
// ============================================================================

/**
 * 매출내역 응답 타입
 */
export interface RevenueHistoryResponse {
  code: number;
  message: string;
  data: RevenueItem[];
  nextToken?: string;
}

export interface RevenueItem {
  orderId: string;
  vendorItemId: string;
  vendorItemName: string;
  quantity: number;
  salePrice: number;
  discountPrice: number;
  /** 정산 예정 금액 */
  settlementPrice: number;
  /** 매출 인식일 (구매확정일 또는 배송완료+7일) */
  recognizedAt: string;
  orderedAt: string;
  deliveredAt?: string;
  /** 배송 타입: ROCKET_GROWTH, THIRD_PARTY 등 */
  shipmentType: string;
  sellerProductId: string;
  sellerProductName: string;
}

/**
 * 매출내역 조회
 * 
 * 로켓그로스 + 판매자배송 모든 매출 포함.
 * 취소/반품이 확정된 건은 제외되므로 정확한 매출 파악에 적합.
 * 
 * @param options.recognitionDateFrom - 매출인식일 시작 (YYYY-MM-DD)
 * @param options.recognitionDateTo - 매출인식일 종료 (YYYY-MM-DD)
 * 
 * @example
 * // 매출인식일 = 구매확정일 또는 배송완료+7일 (자동 구매확정)
 * const revenues = await getRevenueHistory(config, {
 *   vendorId: 'A01241550',
 *   recognitionDateFrom: '2026-01-01',
 *   recognitionDateTo: '2026-01-25',
 * });
 */
export async function getRevenueHistory(
  config: CoupangConfig,
  options: {
    vendorId: string;
    recognitionDateFrom: string;
    recognitionDateTo: string;
    maxPerPage?: number;
    nextToken?: string;
  }
) {
  const { vendorId, recognitionDateFrom, recognitionDateTo, maxPerPage = 50, nextToken } = options;
  
  let path = `/v2/providers/openapi/apis/api/v1/revenue-history`;
  
  const params = new URLSearchParams();
  params.append('vendorId', vendorId);
  params.append('recognitionDateFrom', recognitionDateFrom);
  params.append('recognitionDateTo', recognitionDateTo);
  params.append('maxPerPage', maxPerPage.toString());
  params.append('token', nextToken || '');
  
  path += `?${params.toString()}`;

  return coupangRequest<RevenueHistoryResponse>('GET', path, config);
}

// ============================================================================
// 정산 통계 API
// ============================================================================

export interface RocketGrowthStatisticsResponse {
  code: number;
  message: string;
  data: RocketGrowthStatisticsItem[];
}

export interface RocketGrowthStatisticsItem {
  vendorItemId: number;
  productName: string;
  salesQuantity: number;
  cancelQuantity: number;
  netSalesQuantity: number;
  salesAmount: number;
  cancelAmount: number;
  netSalesAmount: number;
  saleDate: string;
}

/**
 * 정산 예정 금액 조회 (판매 통계)
 * 
 * vendorItemId별 판매수량, 취소수량, 순매출 제공.
 */
export async function getRocketGrowthStatistics(
  config: CoupangConfig,
  options: {
    vendorId: string;
    fromDate: string;
    toDate: string;
  }
) {
  const { vendorId, fromDate, toDate } = options;
  
  let path = `/v2/providers/openapi/apis/api/v1/vendors/${vendorId}/settlement/expected`;
  
  const params = new URLSearchParams();
  params.append('fromDate', fromDate);
  params.append('toDate', toDate);
  
  path += `?${params.toString()}`;

  return coupangRequest<RocketGrowthStatisticsResponse>('GET', path, config);
}

// ============================================================================
// 취소/반품 API
// ============================================================================

export interface CancelRequestResponse {
  code: string;
  message: string;
  data: CancelRequest[];
  nextToken?: string;
}

export interface CancelRequest {
  orderId: number;
  vendorItemId: number;
  cancelType: string;
  cancelReason: string;
  createdAt: string;
  status: string;
}

/**
 * 취소/반품 요청 조회
 * 
 * v4 API 사용으로 로켓그로스 취소 건도 포함.
 * 
 * @param options.cancelType - 요청 유형
 *   - CANCEL: 취소 (status 파라미터 사용 불가)
 *   - RETURN: 반품
 *   - EXCHANGE: 교환
 * @param options.status - 요청 상태 (CANCEL 타입에서는 사용 불가)
 *   - UC: 취소요청
 *   - CC: 취소완료
 * @param options.createdAtFrom - 시작일시 (YYYY-MM-DDTHH:mm)
 * @param options.createdAtTo - 종료일시 (YYYY-MM-DDTHH:mm)
 */
export async function getCancelRequests(
  config: CoupangConfig,
  options: {
    vendorId: string;
    createdAtFrom: string;
    createdAtTo: string;
    cancelType?: 'CANCEL' | 'RETURN' | 'EXCHANGE';
    status?: string;
    searchType?: 'timeFrame';
    orderId?: number;
    nextToken?: string;
  }
) {
  const { vendorId, createdAtFrom, createdAtTo, cancelType, status, searchType, orderId, nextToken } = options;
  
  let path = `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/returnRequests`;
  
  const params = new URLSearchParams();
  params.append('createdAtFrom', createdAtFrom);
  params.append('createdAtTo', createdAtTo);
  if (cancelType) params.append('cancelType', cancelType);
  // 주의: cancelType=CANCEL일 때 status 파라미터는 지원하지 않음
  if (status && cancelType !== 'CANCEL') params.append('status', status);
  if (searchType) params.append('searchType', searchType);
  if (orderId) params.append('orderId', orderId.toString());
  if (nextToken) params.append('nextToken', nextToken);
  
  path += `?${params.toString()}`;

  return coupangRequest<CancelRequestResponse>('GET', path, config);
}

// ============================================================================
// 상품 API
// ============================================================================

export interface SellerProductsResponse {
  code: string;
  message: string;
  data: SellerProduct[];
  nextToken?: string;
}

export interface SellerProduct {
  sellerProductId: number;
  sellerProductName: string;
  displayCategoryCode: number;
  categoryId: number;
  productId: number;
  vendorId: string;
  saleStartedAt: string;
  saleEndedAt: string;
  brand: string;
  /** 상품 상태: 승인완료, 판매중, 판매중지 등 */
  statusName: string;
  items: SellerProductItem[];
}

export interface SellerProductItem {
  sellerProductItemId: number;
  /** 옵션 ID - 쿠팡 내부에서 옵션을 구분하는 고유 ID */
  vendorItemId: number;
  itemName: string;
  originalPrice: number;
  salePrice: number;
  maximumBuyCount: number;
  maximumBuyForPerson: number;
  outboundShippingTimeDay: number;
  searchTags: string;
  images: { imageOrder: number; imageType: string; cdnPath: string }[];
  notices: { noticeCategoryName: string; noticeCategoryDetailName: string; content: string }[];
  attributes: { attributeTypeName: string; attributeValueName: string }[];
  contents: { contentsType: string; contentDetails: any[] }[];
  barcode?: string;
  externalVendorSku?: string;
}

export interface SellerProductDetailResponse {
  code: string;
  message: string;
  data: SellerProductDetail;
}

export interface SellerProductDetail {
  sellerProductId: number;
  sellerProductName: string;
  displayCategoryCode: number;
  brand: string;
  statusName: string;
  items: SellerProductItem[];
}

/**
 * 등록 상품 목록 조회
 * 
 * @param vendorId - 판매자 ID
 * @param options.maxPerPage - 페이지당 상품 수 (최대 100)
 * @param options.sellerProductId - 특정 상품만 조회
 */
export async function getSellerProducts(
  config: CoupangConfig,
  vendorId: string,
  options?: {
    nextToken?: string;
    maxPerPage?: number;
    sellerProductId?: string;
  }
) {
  let path = `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products`;
  
  const params = new URLSearchParams();
  params.append('vendorId', vendorId);
  if (options?.nextToken) params.append('nextToken', options.nextToken);
  if (options?.maxPerPage) params.append('maxPerPage', options.maxPerPage.toString());
  if (options?.sellerProductId) params.append('sellerProductId', options.sellerProductId);
  
  path += `?${params.toString()}`;
  
  return coupangRequest<SellerProductsResponse>('GET', path, config);
}

/**
 * 상품 상세 조회
 * 
 * 상품의 모든 옵션(items) 정보 포함.
 * 로켓그로스 상품의 경우 items[].rocketGrowthItemData에 추가 정보 있음.
 */
export async function getSellerProductDetail(
  config: CoupangConfig,
  sellerProductId: string
) {
  const path = `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${sellerProductId}`;
  return coupangRequest<SellerProductDetailResponse>('GET', path, config);
}
