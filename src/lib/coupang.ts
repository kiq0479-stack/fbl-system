import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import nodeFetch from 'node-fetch';

const COUPANG_API_URL = 'https://api-gateway.coupang.com';

interface CoupangConfig {
  vendorId: string;
  accessKey: string;
  secretKey: string;
}

// 프록시 에이전트 생성 (환경변수에서 프록시 URL 가져옴)
function getProxyAgent(): HttpsProxyAgent<string> | undefined {
  const proxyUrl = process.env.PROXY_URL;
  if (proxyUrl) {
    return new HttpsProxyAgent(proxyUrl);
  }
  return undefined;
}

function generateHmacSignature(
  method: string,
  path: string,
  query: string,
  datetime: string,
  secretKey: string
): string {
  // 쿠팡 공식 문서 형식: datetime + method + path + query
  const message = datetime + method + path + query;
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(message);
  return hmac.digest('hex');
}

function getAuthorizationHeader(
  method: string,
  path: string,
  query: string,
  accessKey: string,
  secretKey: string
): string {
  // Format: YYMMDDTHHMMSSZ (예: 210714T123456Z)
  const datetime = new Date()
    .toISOString()
    .substr(2, 17)
    .replace(/[-:]/g, '') + 'Z';
  
  const signature = generateHmacSignature(method, path, query, datetime, secretKey);
  
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

export async function coupangRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  config: CoupangConfig,
  body?: object
): Promise<T> {
  // path와 query string 분리
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

  // 프록시 에이전트 가져오기 (설정된 경우에만 사용)
  const agent = getProxyAgent();

  // node-fetch 사용 (프록시 agent 지원)
  const response = await nodeFetch(`${COUPANG_API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    agent,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Coupang API Error: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<T>;
}

// 쿠팡 주문 조회 API
export async function getOrders(
  config: CoupangConfig,
  options: {
    vendorId: string;
    createdAtFrom?: string; // YYYY-MM-DD
    createdAtTo?: string;   // YYYY-MM-DD
    status?: string;        // ACCEPT, INSTRUCT, DEPARTURE, DELIVERING, FINAL_DELIVERY
    maxPerPage?: number;
  }
) {
  const { vendorId, createdAtFrom, createdAtTo, status, maxPerPage = 50 } = options;
  
  let path = `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets`;
  
  const params = new URLSearchParams();
  if (createdAtFrom) params.append('createdAtFrom', createdAtFrom);
  if (createdAtTo) params.append('createdAtTo', createdAtTo);
  if (status) params.append('status', status);
  params.append('maxPerPage', maxPerPage.toString());
  
  const queryString = params.toString();
  if (queryString) {
    path += `?${queryString}`;
  }

  return coupangRequest<CoupangOrderResponse>('GET', path, config);
}

// 쿠팡 주문 상세 조회
export async function getOrderDetail(
  config: CoupangConfig,
  vendorId: string,
  shipmentBoxId: number
) {
  const path = `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets/${shipmentBoxId}`;
  return coupangRequest<CoupangOrderDetail>('GET', path, config);
}

// Type definitions
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

// ========================================
// 로켓그로스 API
// ========================================

// 로켓그로스 주문 목록 조회 (결제일 기준)
// paidDateFrom/paidDateTo: yyyymmdd 형식 (예: 20260116)
// 최대 30일까지 조회 가능, 분당 50회 호출 제한
export async function getRocketGrowthOrders(
  config: CoupangConfig,
  options: {
    vendorId: string;
    paidDateFrom: string; // yyyymmdd (결제일 시작, 필수)
    paidDateTo: string;   // yyyymmdd (결제일 끝, 필수)
    nextToken?: string;
  }
) {
  const { vendorId, paidDateFrom, paidDateTo, nextToken } = options;
  
  // 로켓그로스 주문 목록 조회 API
  let path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${vendorId}/rg/orders`;
  
  const params = new URLSearchParams();
  params.append('paidDateFrom', paidDateFrom);
  params.append('paidDateTo', paidDateTo);
  if (nextToken) params.append('nextToken', nextToken);
  
  path += `?${params.toString()}`;

  return coupangRequest<RocketGrowthOrderResponse>('GET', path, config);
}

// 로켓그로스 주문 상세 조회
export async function getRocketGrowthOrderDetail(
  config: CoupangConfig,
  vendorId: string,
  orderId: string
) {
  const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${vendorId}/rg/order/${orderId}`;
  return coupangRequest<RocketGrowthOrderDetailResponse>('GET', path, config);
}

// 로켓그로스 재고 요약 조회
// 분당 50회 호출 제한
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

// 로켓그로스 타입 정의
export interface RocketGrowthOrderResponse {
  code: number;
  message: string;
  data: RocketGrowthOrder[];
  nextToken?: string;
}

export interface RocketGrowthOrder {
  orderId: number;
  vendorId: string;
  paidAt: number; // timestamp in milliseconds (예: 1746093162000)
  orderItems: RocketGrowthOrderItem[];
}

export interface RocketGrowthOrderItem {
  vendorItemId: number;
  productName: string;
  salesQuantity: number;
  salesPrice: number; // 또는 unitSalesPrice
  currency: string;
}

export interface RocketGrowthOrderDetailResponse {
  code: number;
  message: string;
  data: RocketGrowthOrder;
}

export interface RocketGrowthInventoryResponse {
  code: string; // "SUCCESS" 또는 "ERROR"
  message: string;
  data: RocketGrowthInventoryItem[];
  nextToken?: string;
}

export interface RocketGrowthInventoryItem {
  vendorId: string;
  vendorItemId: number;
  externalSkuId?: string;
  inventoryDetails: {
    totalOrderableQuantity: number;
  };
  salesCountMap: {
    SALES_COUNT_LAST_THIRTY_DAYS: number;
  };
}

// ========================================
// 매출/정산 API
// ========================================

// 매출내역 조회 (로켓그로스 + 판매자배송 모두 포함)
// 매출인식일(구매확정일 or 배송완료+7일) 기준
export async function getRevenueHistory(
  config: CoupangConfig,
  options: {
    vendorId: string;
    recognitionDateFrom: string; // YYYY-MM-DD (매출인식일 시작)
    recognitionDateTo: string;   // YYYY-MM-DD (매출인식일 끝)
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
  // token은 페이징용, 첫 요청에는 빈 문자열
  params.append('token', nextToken || '');
  
  path += `?${params.toString()}`;

  return coupangRequest<RevenueHistoryResponse>('GET', path, config);
}

// 매출내역 타입 정의
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
  settlementPrice: number;
  recognizedAt: string;      // 매출인식일
  orderedAt: string;         // 주문일
  deliveredAt?: string;      // 배송완료일
  shipmentType: string;      // ROCKET_GROWTH, THIRD_PARTY 등
  sellerProductId: string;
  sellerProductName: string;
}

// ========================================
// 매출 분석 API (취소/환불 확인용)
// ========================================

// 로켓그로스 상품별 판매 통계 API (Item Daily Sales)
// vendorItemId별 판매수량, 취소수량, 순매출 제공
export async function getRocketGrowthStatistics(
  config: CoupangConfig,
  options: {
    vendorId: string;
    fromDate: string; // YYYY-MM-DD
    toDate: string;   // YYYY-MM-DD
  }
) {
  const { vendorId, fromDate, toDate } = options;
  
  // 정산 예정 금액 API
  let path = `/v2/providers/openapi/apis/api/v1/vendors/${vendorId}/settlement/expected`;
  
  const params = new URLSearchParams();
  params.append('fromDate', fromDate);
  params.append('toDate', toDate);
  
  path += `?${params.toString()}`;

  return coupangRequest<RocketGrowthStatisticsResponse>('GET', path, config);
}

export interface RocketGrowthStatisticsResponse {
  code: number;
  message: string;
  data: RocketGrowthStatisticsItem[];
}

export interface RocketGrowthStatisticsItem {
  vendorItemId: number;
  productName: string;
  salesQuantity: number;    // 판매수량
  cancelQuantity: number;   // 취소수량
  netSalesQuantity: number; // 순판매수량
  salesAmount: number;      // 매출액
  cancelAmount: number;     // 취소금액
  netSalesAmount: number;   // 순매출액
  saleDate: string;
}

// ========================================
// 반품/취소 API
// ========================================

// 반품/취소 요청 목록 조회 (v4 API - 로켓그로스 포함)
// cancelType=CANCEL 일 때 status 파라미터 사용 불가
// searchType=timeFrame 사용 시 createdAtFrom/To 필수
export async function getCancelRequests(
  config: CoupangConfig,
  options: {
    vendorId: string;
    createdAtFrom: string; // YYYY-MM-DDTHH:mm (ISO format)
    createdAtTo: string;   // YYYY-MM-DDTHH:mm (ISO format)
    cancelType?: 'CANCEL' | 'RETURN' | 'EXCHANGE'; // 취소, 반품, 교환
    status?: string; // UC(취소요청), CC(취소완료) 등 - CANCEL일 때는 사용 불가
    searchType?: 'timeFrame'; // 분 단위 조회 시 필요
    orderId?: number;
    nextToken?: string;
  }
) {
  const { vendorId, createdAtFrom, createdAtTo, cancelType, status, searchType, orderId, nextToken } = options;
  
  // v4 API 사용 (로켓그로스 취소 건 포함)
  let path = `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/returnRequests`;
  
  const params = new URLSearchParams();
  params.append('createdAtFrom', createdAtFrom);
  params.append('createdAtTo', createdAtTo);
  if (cancelType) params.append('cancelType', cancelType);
  // cancelType=CANCEL일 때 status는 지원하지 않음
  if (status && cancelType !== 'CANCEL') params.append('status', status);
  if (searchType) params.append('searchType', searchType);
  if (orderId) params.append('orderId', orderId.toString());
  if (nextToken) params.append('nextToken', nextToken);
  
  path += `?${params.toString()}`;

  return coupangRequest<CancelRequestResponse>('GET', path, config);
}

// 취소/반품 응답 타입
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

// ========================================
// 상품 목록 조회 API
// ========================================

// 등록 상품 목록 조회
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
  statusName: string;
  items: SellerProductItem[];
}

export interface SellerProductItem {
  sellerProductItemId: number;
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

// 상품 상세 조회 (옵션 포함)
export async function getSellerProductDetail(
  config: CoupangConfig,
  sellerProductId: string
) {
  const path = `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${sellerProductId}`;
  return coupangRequest<SellerProductDetailResponse>('GET', path, config);
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

// ========================================
// 멀티 계정 지원
// ========================================

export interface CoupangAccount {
  id: string;
  name: string;
  vendorId: string;
  accessKey: string;
  secretKey: string;
}

// 등록된 모든 쿠팡 계정 목록 가져오기
export function getCoupangAccounts(): CoupangAccount[] {
  const accounts: CoupangAccount[] = [];
  
  // 계정 1 (기본)
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
  
  // 계정 2 (쉴트)
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
  
  // 추가 계정들 (필요시 확장)
  // 계정 3, 4, 5...
  
  return accounts;
}

// 특정 계정 ID로 config 가져오기
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

// 기본 config (계정 1)
export function getCoupangConfig(): CoupangConfig {
  const vendorId = process.env.COUPANG_VENDOR_ID;
  const accessKey = process.env.COUPANG_ACCESS_KEY;
  const secretKey = process.env.COUPANG_SECRET_KEY;

  if (!vendorId || !accessKey || !secretKey) {
    throw new Error('Coupang API credentials not configured');
  }

  return { vendorId, accessKey, secretKey };
}
