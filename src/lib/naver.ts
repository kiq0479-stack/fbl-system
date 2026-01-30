/**
 * ============================================================================
 * 네이버 커머스 API 클라이언트
 * ============================================================================
 * 
 * 이 모듈은 네이버 스마트스토어 커머스 API와 통신하는 클라이언트입니다.
 * 
 * ## 주요 기능
 * - 스마트스토어 주문 조회
 * - 상품 주문 상세 내역 조회
 * - 판매 데이터 조회
 * 
 * ## 멀티 계정 지원
 * 현재 1개 계정 지원:
 * - 계정1: KIDL 키들 (NAVER_CLIENT_ID, NAVER_CLIENT_SECRET)
 * 
 * ## 인증 방식
 * OAuth2 Client Credentials + bcrypt 전자서명
 * - client_secret을 직접 전달하지 않고 bcrypt 해시 서명 사용
 * - 토큰 유효기간: 1시간 (3600초)
 * 
 * @see https://apicenter.commerce.naver.com/docs 네이버 커머스API센터
 */

import bcrypt from 'bcryptjs';
import { HttpsProxyAgent } from 'https-proxy-agent';
import nodeFetch from 'node-fetch';

// ============================================================================
// 상수 및 타입 정의
// ============================================================================

const NAVER_API_URL = 'https://api.commerce.naver.com';

/**
 * 프록시 에이전트 생성
 * 네이버 API도 IP 화이트리스트 방식이므로, 등록된 고정 IP에서만 호출 가능.
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
 * 네이버 API 인증 설정
 * @property clientId - 애플리케이션 ID
 * @property clientSecret - 애플리케이션 시크릿 (bcrypt salt로 사용)
 */
export interface NaverConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * 네이버 계정 정보 (멀티 계정 지원용)
 * @property id - 내부 식별자 ('1', '2', ...)
 * @property name - 계정 표시명 (예: 'KIDL 키들')
 * @property storeName - 스토어명
 */
export interface NaverAccount {
  id: string;
  name: string;
  storeName: string;
  clientId: string;
  clientSecret: string;
}

/**
 * OAuth2 토큰 응답
 */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * 토큰 캐시 (메모리)
 * 토큰 재발급 최소화를 위한 캐싱
 */
interface TokenCache {
  accessToken: string;
  expiresAt: number; // Unix timestamp (ms)
}

const tokenCache: Map<string, TokenCache> = new Map();

// ============================================================================
// 내부 헬퍼 함수
// ============================================================================

/**
 * bcrypt 전자서명 생성
 * 
 * 네이버 API는 client_secret을 직접 전달하지 않고,
 * bcrypt 해시를 사용한 전자서명으로 인증합니다.
 * 
 * 서명 생성 과정:
 * 1. password = client_id + "_" + timestamp
 * 2. hash = bcrypt.hashpw(password, client_secret)
 * 3. signature = base64(hash)
 * 
 * @param clientId - 애플리케이션 ID
 * @param clientSecret - 애플리케이션 시크릿 (bcrypt salt, 예: $2a$04$...)
 * @param timestamp - 밀리초 단위 Unix 시간
 * @returns Base64 인코딩된 bcrypt 해시
 */
function generateSignature(
  clientId: string,
  clientSecret: string,
  timestamp: number
): string {
  // password: client_id + "_" + timestamp
  const password = `${clientId}_${timestamp}`;
  
  // bcrypt 해시 생성 (client_secret이 salt로 사용됨)
  const hash = bcrypt.hashSync(password, clientSecret);
  
  // Base64 인코딩하여 반환
  return Buffer.from(hash, 'utf-8').toString('base64');
}

/**
 * OAuth2 액세스 토큰 발급
 * 
 * @param config - 인증 설정
 * @returns 액세스 토큰
 * @throws Error - 토큰 발급 실패시
 */
async function getAccessToken(config: NaverConfig): Promise<string> {
  const cacheKey = config.clientId;
  const cached = tokenCache.get(cacheKey);
  
  // 캐시된 토큰이 유효한지 확인 (만료 5분 전까지 유효)
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.accessToken;
  }
  
  const timestamp = Date.now();
  const signature = generateSignature(
    config.clientId,
    config.clientSecret,
    timestamp
  );
  
  const params = new URLSearchParams();
  params.append('client_id', config.clientId);
  params.append('timestamp', timestamp.toString());
  params.append('client_secret_sign', signature);
  params.append('grant_type', 'client_credentials');
  params.append('type', 'SELF'); // SELF: 자사 스토어, SELLER: 위임 스토어
  
  const agent = getProxyAgent();
  
  const response = await nodeFetch(`${NAVER_API_URL}/external/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    agent,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Naver OAuth Error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json() as TokenResponse;
  
  // 토큰 캐시 저장
  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  
  return data.access_token;
}

// ============================================================================
// 핵심 API 요청 함수
// ============================================================================

/**
 * 네이버 API 요청 (범용)
 * 모든 네이버 API 호출의 기반 함수.
 * 
 * @template T - 응답 타입
 * @param method - HTTP 메서드
 * @param path - API 경로
 * @param config - 인증 설정
 * @param body - POST/PUT 요청 바디
 * @param queryParams - 쿼리 파라미터
 * @returns API 응답
 * 
 * @throws Error - API 호출 실패시 (4xx, 5xx)
 */
export async function naverRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  config: NaverConfig,
  body?: object,
  queryParams?: Record<string, string | string[] | undefined>
): Promise<T> {
  const accessToken = await getAccessToken(config);
  
  // 쿼리 스트링 생성
  let url = `${NAVER_API_URL}${path}`;
  if (queryParams) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach(v => params.append(key, v));
      } else {
        params.append(key, value);
      }
    }
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  
  const agent = getProxyAgent();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  };
  
  const response = await nodeFetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    agent,
  });
  
  // 401 에러시 토큰 재발급 후 재시도
  if (response.status === 401) {
    tokenCache.delete(config.clientId);
    const newToken = await getAccessToken(config);
    
    const retryResponse = await nodeFetch(url, {
      method,
      headers: {
        ...headers,
        'Authorization': `Bearer ${newToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      agent,
    });
    
    if (!retryResponse.ok) {
      const errorText = await retryResponse.text();
      throw new Error(`Naver API Error: ${retryResponse.status} - ${errorText}`);
    }
    
    return retryResponse.json() as T;
  }
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Naver API Error: ${response.status} - ${errorText}`);
  }
  
  return response.json() as T;
}

// ============================================================================
// 멀티 계정 관리
// ============================================================================

/**
 * 등록된 모든 네이버 계정 목록 조회
 * 
 * 계정 추가 방법:
 * 1. Vercel/로컬에 환경변수 추가 (NAVER_CLIENT_ID_N, NAVER_CLIENT_SECRET_N)
 * 2. 이 함수에 계정 로드 로직 추가
 * 3. 네이버 커머스API센터에서 해당 계정 앱 등록
 * 
 * @returns 계정 배열 (환경변수 설정된 계정만)
 */
export function getNaverAccounts(): NaverAccount[] {
  const accounts: NaverAccount[] = [];
  
  // ─────────────────────────────────────────────────────────────────────────
  // 계정 1: KIDL 키들
  // ─────────────────────────────────────────────────────────────────────────
  const clientId1 = process.env.NAVER_CLIENT_ID;
  const clientSecret1 = process.env.NAVER_CLIENT_SECRET;
  
  if (clientId1 && clientSecret1) {
    accounts.push({
      id: '1',
      name: 'KIDL 키들',
      storeName: 'KIDL 키들',
      clientId: clientId1,
      clientSecret: clientSecret1,
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // 계정 2, 3, 4... (필요시 위와 같은 패턴으로 추가)
  // ─────────────────────────────────────────────────────────────────────────
  
  return accounts;
}

/**
 * 특정 계정 ID로 NaverConfig 조회
 */
export function getNaverConfigById(accountId: string): NaverConfig {
  const accounts = getNaverAccounts();
  const account = accounts.find(a => a.id === accountId);
  
  if (!account) {
    throw new Error(`Naver account not found: ${accountId}`);
  }
  
  return {
    clientId: account.clientId,
    clientSecret: account.clientSecret,
  };
}

/**
 * 기본 계정(계정 1) Config 조회
 */
export function getNaverConfig(): NaverConfig {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('Naver API credentials not configured');
  }
  
  return { clientId, clientSecret };
}

/**
 * NaverAccount에서 NaverConfig 추출 헬퍼
 */
export function accountToConfig(account: NaverAccount): NaverConfig {
  return {
    clientId: account.clientId,
    clientSecret: account.clientSecret,
  };
}

// ============================================================================
// 주문 조회 API
// ============================================================================

/**
 * 상품 주문 목록 조회 응답 타입
 */
export interface NaverProductOrdersResponse {
  timestamp?: string;
  traceId?: string;
  data?: {
    count?: number;
    productOrderIds?: string[];
    // 실제 API 응답 구조
    contents?: NaverProductOrderContent[];
    pagination?: {
      page: number;
      size: number;
      hasNext: boolean;
    };
  };
  // 페이징 응답일 경우
  content?: NaverProductOrder[];
  totalElements?: number;
  totalPages?: number;
}

/**
 * 상품 주문 콘텐츠 (API 응답 구조)
 */
export interface NaverProductOrderContent {
  productOrderId: string;
  content: {
    order: NaverOrderInfo;
    productOrder: NaverProductOrderInfo;
    delivery?: NaverDeliveryInfo;
  };
}

export interface NaverOrderInfo {
  orderId: string;
  orderDate: string;
  paymentDate?: string;
  ordererId?: string;
  ordererName?: string;
  ordererTel?: string;
  paymentMeans?: string;
  payLocationType?: string;
  generalPaymentAmount?: number;
  naverMileagePaymentAmount?: number;
  chargeAmountPaymentAmount?: number;
}

export interface NaverProductOrderInfo {
  productOrderId: string;
  productId?: string;
  productName: string;
  productOption?: string;  // 옵션명 (예: "베이지그린", "L사이즈")
  optionCode?: string;     // 옵션 코드
  quantity: number;
  unitPrice: number;
  totalProductAmount: number;
  totalPaymentAmount: number;
  productOrderStatus: string;
  placeOrderStatus?: string;
  placeOrderDate?: string;
  shippingDueDate?: string;
  shippingMemo?: string;
  expectedSettlementAmount?: number;
  deliveryFeeAmount?: number;
  productDiscountAmount?: number;
  shippingAddress?: {
    name?: string;
    tel1?: string;
    zipCode?: string;
    baseAddress?: string;
    detailedAddress?: string;
  };
}

export interface NaverDeliveryInfo {
  deliveryCompany?: string;
  deliveryMethod?: string;
  deliveryStatus?: string;
  trackingNumber?: string;
  sendDate?: string;
  pickupDate?: string;
}

/**
 * 상품 주문 상세 정보
 */
export interface NaverProductOrder {
  productOrderId: string;
  orderId: string;
  orderDate: string;
  paymentDate?: string;
  orderStatus: string;
  claimStatus?: string;
  productName: string;
  productOption?: string;
  quantity: number;
  totalPaymentAmount: number;
  productOrderStatus: string;
  deliveryMethod?: string;
  placeOrderDate?: string;
  dispatchedDate?: string;
  deliveredDate?: string;
  purchaseDecisionDate?: string;
  ordererName?: string;
  ordererTel?: string;
  receiverName?: string;
  receiverTel1?: string;
  receiverAddress?: string;
  deliveryFee?: number;
  commissionFee?: number;
  settleExpectAmount?: number;
}

/**
 * 상품 주문 상세 조회 응답
 */
export interface NaverProductOrderDetailResponse {
  data: NaverProductOrder[];
}

/**
 * 주문 상태 enum
 */
export type NaverOrderStatus = 
  | 'PAYMENT_WAITING'  // 결제대기
  | 'PAYED'            // 결제완료
  | 'DELIVERING'       // 배송중
  | 'DELIVERED'        // 배송완료
  | 'PURCHASE_DECIDED' // 구매확정
  | 'EXCHANGED'        // 교환완료
  | 'CANCELED'         // 취소완료
  | 'RETURNED'         // 반품완료
  | 'CANCELED_BY_NOPAYMENT'; // 미결제취소

/**
 * 조회 기준 타입 enum
 */
export type NaverRangeType =
  | 'PAYED_DATETIME'              // 결제일시
  | 'ORDERED_DATETIME'            // 주문일시
  | 'DISPATCHED_DATETIME'         // 발송일시
  | 'PURCHASE_DECIDED_DATETIME'   // 구매확정일시
  | 'CLAIM_REQUESTED_DATETIME'    // 클레임요청일시
  | 'CLAIM_COMPLETED_DATETIME'    // 클레임완료일시
  | 'COLLECT_COMPLETED_DATETIME'; // 수거완료일시

/**
 * 상품 주문 목록 조회 (조건 기반)
 * 
 * @param config - 인증 설정
 * @param options - 조회 옵션
 * @param options.from - 시작일시 (ISO 8601, 예: 2026-01-01T00:00:00.000+09:00)
 * @param options.to - 종료일시 (선택, 미지정시 from+24시간)
 * @param options.rangeType - 조회 기준 (기본: PAYED_DATETIME)
 * @param options.productOrderStatuses - 주문 상태 필터
 * @param options.pageSize - 페이지 크기 (기본: 300, 최대: 300)
 * @param options.page - 페이지 번호 (기본: 1)
 * 
 * @example
 * const orders = await getProductOrders(config, {
 *   from: '2026-01-01T00:00:00.000+09:00',
 *   to: '2026-01-25T23:59:59.999+09:00',
 *   rangeType: 'PAYED_DATETIME',
 *   productOrderStatuses: ['PAYED', 'DELIVERING'],
 * });
 */
export async function getProductOrders(
  config: NaverConfig,
  options: {
    from: string;
    to?: string;
    rangeType?: NaverRangeType;
    productOrderStatuses?: NaverOrderStatus[];
    claimStatuses?: string[];
    pageSize?: number;
    page?: number;
  }
) {
  const {
    from,
    to,
    rangeType = 'PAYED_DATETIME',
    productOrderStatuses,
    claimStatuses,
    pageSize = 300,
    page = 1,
  } = options;
  
  const queryParams: Record<string, string | string[] | undefined> = {
    from,
    to,
    rangeType,
    productOrderStatuses,
    claimStatuses,
    pageSize: pageSize.toString(),
    page: page.toString(),
  };
  
  return naverRequest<NaverProductOrdersResponse>(
    'GET',
    '/external/v1/pay-order/seller/product-orders',
    config,
    undefined,
    queryParams
  );
}

/**
 * 상품 주문 상세 내역 조회
 * 
 * 상품주문번호(productOrderId) 목록으로 상세 정보 조회.
 * 최대 300개까지 한번에 조회 가능.
 * 
 * @param config - 인증 설정
 * @param productOrderIds - 상품주문번호 배열 (최대 300개)
 */
export async function getProductOrderDetails(
  config: NaverConfig,
  productOrderIds: string[]
) {
  if (productOrderIds.length > 300) {
    throw new Error('Maximum 300 productOrderIds allowed per request');
  }
  
  return naverRequest<NaverProductOrderDetailResponse>(
    'POST',
    '/external/v1/pay-order/seller/product-orders/query',
    config,
    { productOrderIds }
  );
}

// ============================================================================
// 변경 주문 조회 API
// ============================================================================

/**
 * 변경 상품 주문 내역 조회 (취소/반품/교환)
 * 
 * @param config - 인증 설정
 * @param options - 조회 옵션
 */
export async function getChangedOrders(
  config: NaverConfig,
  options: {
    from: string;
    to?: string;
    claimTypes?: ('CANCEL' | 'RETURN' | 'EXCHANGE')[];
    pageSize?: number;
    page?: number;
  }
) {
  const {
    from,
    to,
    claimTypes,
    pageSize = 300,
    page = 1,
  } = options;
  
  const queryParams: Record<string, string | string[] | undefined> = {
    from,
    to,
    claimTypes,
    pageSize: pageSize.toString(),
    page: page.toString(),
  };
  
  return naverRequest<NaverProductOrdersResponse>(
    'GET',
    '/external/v1/pay-order/seller/product-orders/changed',
    config,
    undefined,
    queryParams
  );
}

// ============================================================================
// 정산 API
// ============================================================================

/**
 * 정산 내역 응답 타입
 */
export interface NaverSettlementResponse {
  data: NaverSettlementItem[];
  totalElements?: number;
}

export interface NaverSettlementItem {
  productOrderId: string;
  orderId: string;
  settleDate: string;
  settleAmount: number;
  commissionFee: number;
  deliveryFee: number;
  claimDeliveryFee?: number;
  productName: string;
  quantity: number;
}

/**
 * 정산 예정 내역 조회
 * 
 * @param config - 인증 설정
 * @param options - 조회 옵션
 */
export async function getSettlements(
  config: NaverConfig,
  options: {
    from: string;
    to: string;
    pageSize?: number;
    page?: number;
  }
) {
  const { from, to, pageSize = 100, page = 1 } = options;
  
  const queryParams: Record<string, string | undefined> = {
    from,
    to,
    pageSize: pageSize.toString(),
    page: page.toString(),
  };
  
  return naverRequest<NaverSettlementResponse>(
    'GET',
    '/external/v1/pay-order/seller/settlements',
    config,
    undefined,
    queryParams
  );
}

// ============================================================================
// 상품 목록 조회 API
// ============================================================================

/**
 * 상품 목록 조회 응답 타입
 */
export interface NaverProductsSearchResponse {
  contents?: NaverProductSearchItem[];
  page?: number;
  size?: number;
  totalElements?: number;
  totalPages?: number;
}

export interface NaverChannelProduct {
  originProductNo: number;
  channelProductNo: number;
  channelServiceType?: string;
  categoryId?: string;
  name: string;  // 실제 상품명
  statusType?: string;
  channelProductDisplayStatusType?: string;
  salePrice?: number;
  discountedPrice?: number;
  stockQuantity?: number;
  regDate?: string;
  modifiedDate?: string;
}

export interface NaverProductSearchItem {
  originProductNo: number;
  channelProducts?: NaverChannelProduct[];
  // 아래는 레거시 또는 다른 API 응답용
  channelProductNo?: number;
  channelProductName?: string;
  originProductName?: string;
  statusType?: string;
  channelProductDisplayStatusType?: string;
  salePrice?: number;
  stockQuantity?: number;
  categoryId?: string;
  regDate?: string;
  modifiedDate?: string;
}

/**
 * 상품 판매 상태
 */
export type NaverProductStatusType = 
  | 'SALE'         // 판매중
  | 'OUTOFSTOCK'   // 품절
  | 'SUSPENSION'   // 판매중지
  | 'WAIT'         // 판매대기
  | 'UNADMISSION'  // 미승인
  | 'PROHIBITION'  // 판매금지
  | 'DELETE';      // 삭제

/**
 * 상품 목록 조회
 * 
 * @param config - 인증 설정
 * @param options - 조회 옵션
 * @param options.statusType - 판매 상태 필터
 * @param options.page - 페이지 번호 (기본: 1)
 * @param options.size - 페이지 크기 (기본: 100, 최대: 500)
 */
export async function searchProducts(
  config: NaverConfig,
  options?: {
    statusType?: NaverProductStatusType;
    page?: number;
    size?: number;
  }
): Promise<NaverProductsSearchResponse> {
  const {
    statusType,
    page = 1,
    size = 100,
  } = options || {};
  
  const body: Record<string, unknown> = {
    page,
    size,
  };
  
  if (statusType) {
    body.statusType = statusType;
  }
  
  return naverRequest<NaverProductsSearchResponse>(
    'POST',
    '/external/v1/products/search',
    config,
    body
  );
}

/**
 * 판매중인 모든 상품 조회 (페이징 처리)
 * 
 * @param config - 인증 설정
 * @returns 판매중인 상품 목록 (statusType === 'SALE'만)
 */
export async function getAllSaleProducts(
  config: NaverConfig
): Promise<NaverProductSearchItem[]> {
  const allProducts: NaverProductSearchItem[] = [];
  let page = 1;
  const size = 500;
  
  while (true) {
    const response = await searchProducts(config, {
      statusType: 'SALE',
      page,
      size,
    });
    
    const contents = response.contents || [];
    // 네이버 API가 statusType 필터를 정확히 적용 안 할 수 있어서 클라이언트에서 재필터링
    const saleOnly = contents.filter(p => {
      const channelProduct = p.channelProducts?.[0];
      const status = channelProduct?.statusType || p.statusType;
      return status === 'SALE';
    });
    allProducts.push(...saleOnly);
    
    // 마지막 페이지면 종료
    if (contents.length < size || page >= (response.totalPages || 1)) {
      break;
    }
    
    page++;
    
    // 안전장치: 최대 10페이지
    if (page > 10) break;
  }
  
  return allProducts;
}

// ============================================================================
// 상품 상세 조회 API
// ============================================================================

/**
 * 상품 옵션 조합 타입
 */
export interface NaverOptionCombination {
  id: number;
  optionName1?: string;
  optionName2?: string;
  optionName3?: string;
  optionName4?: string;
  stockQuantity: number;
  price: number;
  usable: boolean;
  sellerManagerCode?: string;
}

/**
 * 상품 옵션 정보 타입
 */
export interface NaverProductOption {
  groupName?: string;           // 옵션 그룹명 (예: "색상", "사이즈")
  optionValues?: string[];      // 옵션 값 목록 (예: ["베이지그린", "베이지브라운"])
}

/**
 * 상품 상세 응답 타입
 */
export interface NaverProductDetailResponse {
  originProduct?: {
    statusType?: string;
    saleType?: string;
    leafCategoryId?: string;
    name?: string;
    salePrice?: number;
    stockQuantity?: number;
    detailContent?: string;
    images?: {
      representativeImage?: { url?: string };
      optionalImages?: Array<{ url?: string }>;
    };
    detailAttribute?: {
      naverShoppingSearchInfo?: {
        manufacturerName?: string;
        brandName?: string;
        modelName?: string;
      };
      optionInfo?: {
        simpleOptionSortType?: string;
        optionSimple?: Array<{
          groupName?: string;
          optionList?: Array<{
            optionValue?: string;
            id?: number;
          }>;
        }>;
        optionCombinationSortType?: string;
        optionCombinations?: NaverOptionCombination[];
        optionCombinationGroupNames?: {
          optionGroupName1?: string;
          optionGroupName2?: string;
          optionGroupName3?: string;
          optionGroupName4?: string;
        };
        useStockManagement?: boolean;
        optionDeliveryAttributes?: unknown[];
      };
    };
  };
  smartstoreChannelProduct?: {
    channelProductNo?: number;
    name?: string;
    channelProductDisplayStatusType?: string;
  };
}

/**
 * 상품 상세 조회
 * 
 * 상품 옵션 정보를 포함한 상세 데이터를 조회합니다.
 * v2 API 사용 (v1은 deprecated)
 * 
 * @param config - 인증 설정
 * @param originProductNo - 원상품 번호
 * @returns 상품 상세 정보 (옵션 포함)
 */
export async function getProductDetail(
  config: NaverConfig,
  originProductNo: number
): Promise<NaverProductDetailResponse> {
  return naverRequest<NaverProductDetailResponse>(
    'GET',
    `/external/v2/products/origin-products/${originProductNo}`,
    config
  );
}

/**
 * 상품의 옵션 이름 목록 추출
 * 
 * 상품 상세 정보에서 옵션 조합의 옵션명들을 추출합니다.
 * 
 * @param detail - 상품 상세 응답
 * @returns 옵션명 배열 (중복 제거, 정렬됨)
 */
export function extractOptionNames(detail: NaverProductDetailResponse): string[] {
  const optionInfo = detail.originProduct?.detailAttribute?.optionInfo;
  if (!optionInfo) return [];

  const optionNames = new Set<string>();

  // 1. optionCombinations에서 옵션명 추출
  const combinations = optionInfo.optionCombinations || [];
  for (const combo of combinations) {
    if (combo.optionName1) optionNames.add(combo.optionName1);
    if (combo.optionName2) optionNames.add(combo.optionName2);
    if (combo.optionName3) optionNames.add(combo.optionName3);
    if (combo.optionName4) optionNames.add(combo.optionName4);
  }

  // 2. optionSimple에서 옵션값 추출 (단순 옵션의 경우)
  const simpleOptions = optionInfo.optionSimple || [];
  for (const group of simpleOptions) {
    const optionList = group.optionList || [];
    for (const opt of optionList) {
      if (opt.optionValue) optionNames.add(opt.optionValue);
    }
  }

  // 정렬하여 반환
  return Array.from(optionNames).sort((a, b) => a.localeCompare(b, 'ko'));
}
