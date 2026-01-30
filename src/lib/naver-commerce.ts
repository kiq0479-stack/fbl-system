/**
 * ============================================================================
 * 네이버 커머스 API 클라이언트
 * ============================================================================
 * 
 * 네이버 스마트스토어 커머스 API와 통신하는 클라이언트입니다.
 * 
 * ## 환경변수
 * - NAVER_COMMERCE_CLIENT_ID: 네이버 커머스 API 클라이언트 ID
 * - NAVER_COMMERCE_CLIENT_SECRET: 네이버 커머스 API 클라이언트 시크릿
 * 
 * ## Graceful Fallback
 * 환경변수가 설정되지 않으면 모든 함수가 빈 배열을 반환합니다.
 * 키가 준비되면 환경변수만 추가하면 자동으로 활성화됩니다.
 * 
 * @see https://apicenter.commerce.naver.com/ 네이버 커머스 API 센터
 */

// ============================================================================
// 타입 정의
// ============================================================================

export interface NaverCommerceConfig {
  clientId: string;
  clientSecret: string;
}

export interface NaverCommerceToken {
  accessToken: string;
  expiresAt: number;
}

export interface NaverOrderItem {
  productOrderId: string;
  productId: string;
  productName: string;
  quantity: number;
  totalPaymentAmount: number;
  productOrderStatus: string;
  /** 주문일시 (ISO 8601) */
  orderDate: string;
}

export interface NaverSalesSummaryItem {
  productId: string;
  productName: string;
  salesQuantity: number;
  source: 'naver';
}

// ============================================================================
// 설정 확인
// ============================================================================

/**
 * 네이버 커머스 API 설정 가져오기
 * 환경변수가 없으면 null 반환 (graceful skip)
 */
export function getNaverCommerceConfig(): NaverCommerceConfig | null {
  const clientId = process.env.NAVER_COMMERCE_CLIENT_ID;
  const clientSecret = process.env.NAVER_COMMERCE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

/**
 * 네이버 커머스 API 사용 가능 여부
 */
export function isNaverCommerceAvailable(): boolean {
  return getNaverCommerceConfig() !== null;
}

// ============================================================================
// 인증
// ============================================================================

// 토큰 캐시 (메모리)
let cachedToken: NaverCommerceToken | null = null;

/**
 * 네이버 커머스 API 액세스 토큰 발급
 * 
 * OAuth2 client_credentials 방식으로 토큰 발급.
 * 발급된 토큰은 메모리에 캐시하여 만료 전까지 재사용.
 * 
 * @returns 액세스 토큰 또는 null (설정 미완료시)
 */
export async function getNaverAccessToken(): Promise<string | null> {
  const config = getNaverCommerceConfig();
  if (!config) {
    return null;
  }

  // 캐시된 토큰이 유효하면 재사용
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  try {
    // BCrypt timestamp + client_id + client_secret 조합으로 서명 생성
    const timestamp = Date.now();
    const clientId = config.clientId;
    const clientSecret = config.clientSecret;

    // 네이버 커머스 API 토큰 요청
    const tokenUrl = 'https://api.commerce.naver.com/external/v1/oauth2/token';
    
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('timestamp', timestamp.toString());
    params.append('client_secret_sign', await generateNaverSignature(clientId, clientSecret, timestamp));
    params.append('grant_type', 'client_credentials');
    params.append('type', 'SELF');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      console.error(`[NaverCommerce] Token error: ${response.status} ${await response.text()}`);
      return null;
    }

    const data = await response.json();
    
    cachedToken = {
      accessToken: data.access_token,
      // 토큰 유효시간 (기본 24시간에서 1분 여유)
      expiresAt: Date.now() + (data.expires_in || 86400) * 1000,
    };

    return cachedToken.accessToken;
  } catch (error) {
    console.error('[NaverCommerce] Token request failed:', error);
    return null;
  }
}

/**
 * 네이버 API 서명 생성
 * client_id + '_' + timestamp를 client_secret으로 HMAC-SHA256 서명
 */
async function generateNaverSignature(
  clientId: string,
  clientSecret: string,
  timestamp: number
): Promise<string> {
  const crypto = await import('crypto');
  const message = `${clientId}_${timestamp}`;
  const hmac = crypto.createHmac('sha256', clientSecret);
  hmac.update(message);
  return hmac.digest('base64');
}

// ============================================================================
// 주문 조회
// ============================================================================

/**
 * 네이버 커머스 주문 조회
 * 
 * 기간별 주문 데이터를 가져옵니다.
 * API 키가 없으면 빈 배열을 반환합니다.
 * 
 * @param dateFrom - 시작일 (YYYY-MM-DD)
 * @param dateTo - 종료일 (YYYY-MM-DD)
 * @returns 주문 아이템 배열
 */
export async function getNaverOrders(
  dateFrom: string,
  dateTo: string
): Promise<NaverOrderItem[]> {
  const token = await getNaverAccessToken();
  if (!token) {
    // API 키 미설정 - graceful skip
    return [];
  }

  try {
    const allOrders: NaverOrderItem[] = [];
    let lastChangedFrom = `${dateFrom}T00:00:00.000+09:00`;
    const lastChangedTo = `${dateTo}T23:59:59.999+09:00`;
    let hasMore = true;

    while (hasMore) {
      const url = new URL('https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/last-changed-statuses');
      url.searchParams.set('lastChangedFrom', lastChangedFrom);
      url.searchParams.set('lastChangedTo', lastChangedTo);
      // 결제완료 이후 상태만 (취소 전)
      url.searchParams.set('lastChangedType', 'PAYED');

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`[NaverCommerce] Order fetch error: ${response.status}`);
        break;
      }

      const data = await response.json();
      const productOrderIds = (data.data?.lastChangeStatuses || []).map(
        (s: any) => s.productOrderId
      );

      if (productOrderIds.length === 0) {
        hasMore = false;
        break;
      }

      // 상세 정보 조회
      const detailResponse = await fetch(
        'https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/query',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ productOrderIds }),
        }
      );

      if (detailResponse.ok) {
        const detailData = await detailResponse.json();
        const orders = (detailData.data || []).map((order: any) => ({
          productOrderId: order.productOrderId,
          productId: order.productId || '',
          productName: order.productName || '',
          quantity: order.quantity || 1,
          totalPaymentAmount: order.totalPaymentAmount || 0,
          productOrderStatus: order.productOrderStatus || '',
          orderDate: order.orderDate || '',
        }));
        allOrders.push(...orders);
      }

      // 더 가져올 데이터가 있는지 확인
      if (data.data?.moreSequence) {
        lastChangedFrom = data.data.moreSequence;
      } else {
        hasMore = false;
      }
    }

    return allOrders;
  } catch (error) {
    console.error('[NaverCommerce] Order fetch failed:', error);
    return [];
  }
}

/**
 * 네이버 커머스 기간별 판매량 집계
 * 
 * 상품별 판매 수량을 합산하여 반환합니다.
 * API 키가 없으면 빈 배열을 반환합니다.
 * 
 * @param dateFrom - 시작일 (YYYY-MM-DD)
 * @param dateTo - 종료일 (YYYY-MM-DD)
 * @returns 상품별 판매 수량 집계
 */
export async function getNaverSalesSummary(
  dateFrom: string,
  dateTo: string
): Promise<NaverSalesSummaryItem[]> {
  const orders = await getNaverOrders(dateFrom, dateTo);

  if (orders.length === 0) {
    return [];
  }

  // 상품별 판매량 집계
  const salesMap = new Map<string, { productName: string; quantity: number }>();

  for (const order of orders) {
    const key = order.productId;
    const existing = salesMap.get(key);
    if (existing) {
      existing.quantity += order.quantity;
    } else {
      salesMap.set(key, {
        productName: order.productName,
        quantity: order.quantity,
      });
    }
  }

  return Array.from(salesMap.entries()).map(([productId, data]) => ({
    productId,
    productName: data.productName,
    salesQuantity: data.quantity,
    source: 'naver' as const,
  }));
}
