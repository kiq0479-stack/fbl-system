#!/usr/bin/env node

/**
 * 네이버 주문 동기화 스크립트 (GitHub Actions용)
 *
 * Vercel Hobby plan의 10초 timeout 제한을 우회하기 위해
 * GitHub Actions에서 직접 실행하는 독립 스크립트.
 *
 * Usage:
 *   node scripts/naver-sync.mjs                        # 최근 7일 동기화
 *   node scripts/naver-sync.mjs --days 14              # 최근 14일
 *   node scripts/naver-sync.mjs --from 2025-01-01 --to 2025-01-31
 *
 * Required env:
 *   NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env:
 *   PROXY_URL  - HTTPS 프록시 (네이버 API IP 화이트리스트 대응)
 */

import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// CLI 인자 파싱
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { from: '', to: '', days: 7 };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) parsed.from = args[++i];
    else if (args[i] === '--to' && args[i + 1]) parsed.to = args[++i];
    else if (args[i] === '--days' && args[i + 1]) parsed.days = parseInt(args[++i], 10);
  }

  if (!parsed.from) parsed.from = getKSTDaysAgo(parsed.days);
  if (!parsed.to) parsed.to = getKSTDaysAgo(1);

  return parsed;
}

// ============================================================================
// 환경변수 검증
// ============================================================================

function validateEnv() {
  const required = [
    'NAVER_CLIENT_ID',
    'NAVER_CLIENT_SECRET',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`❌ Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// ============================================================================
// 날짜 유틸리티
// ============================================================================

function formatDateKST(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toKSTStart(dateStr) {
  return `${dateStr}T00:00:00.000+09:00`;
}

function toKSTEnd(dateStr) {
  return `${dateStr}T23:59:59.999+09:00`;
}

function splitDateRange(fromStr, toStr) {
  const fromDate = new Date(fromStr + 'T00:00:00+09:00');
  const toDate = new Date(toStr + 'T00:00:00+09:00');
  const ranges = [];
  const current = new Date(fromDate);

  while (current <= toDate) {
    const dateStr = formatDateKST(current);
    ranges.push({ from: toKSTStart(dateStr), to: toKSTEnd(dateStr) });
    current.setDate(current.getDate() + 1);
  }
  return ranges;
}

function getKSTDaysAgo(daysAgo) {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  kstNow.setDate(kstNow.getDate() - daysAgo);
  return formatDateKST(kstNow);
}

// ============================================================================
// 네이버 API 클라이언트
// ============================================================================

const NAVER_API_URL = 'https://api.commerce.naver.com';

// 토큰 캐시
let tokenCache = null;

/**
 * bcrypt 전자서명 생성 (네이버 API 인증)
 */
function generateSignature(clientId, clientSecret, timestamp) {
  const password = `${clientId}_${timestamp}`;
  const hash = bcrypt.hashSync(password, clientSecret);
  return Buffer.from(hash, 'utf-8').toString('base64');
}

/**
 * OAuth2 액세스 토큰 발급
 */
async function getAccessToken(clientId, clientSecret) {
  // 캐시 확인 (만료 5분 전까지 유효)
  if (tokenCache && tokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
    return tokenCache.accessToken;
  }

  const timestamp = Date.now();
  const signature = generateSignature(clientId, clientSecret, timestamp);

  const params = new URLSearchParams({
    client_id: clientId,
    timestamp: timestamp.toString(),
    client_secret_sign: signature,
    grant_type: 'client_credentials',
    type: 'SELF',
  });

  const fetchOptions = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() };

  // 프록시 지원 (선택)
  if (process.env.PROXY_URL) {
    const { HttpsProxyAgent } = await import('https-proxy-agent');
    fetchOptions.agent = new HttpsProxyAgent(process.env.PROXY_URL);
  }

  const nodeFetch = (await import('node-fetch')).default;
  const response = await nodeFetch(`${NAVER_API_URL}/external/v1/oauth2/token`, fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Naver OAuth Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * 네이버 API 범용 요청
 */
async function naverRequest(method, path, clientId, clientSecret, body, queryParams) {
  const accessToken = await getAccessToken(clientId, clientSecret);

  let url = `${NAVER_API_URL}${path}`;
  if (queryParams) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, v));
      } else {
        params.append(key, value);
      }
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const fetchOptions = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: body ? JSON.stringify(body) : undefined,
  };

  if (process.env.PROXY_URL) {
    const { HttpsProxyAgent } = await import('https-proxy-agent');
    fetchOptions.agent = new HttpsProxyAgent(process.env.PROXY_URL);
  }

  const nodeFetch = (await import('node-fetch')).default;
  let response = await nodeFetch(url, fetchOptions);

  // 401 → 토큰 재발급 후 재시도
  if (response.status === 401) {
    tokenCache = null;
    const newToken = await getAccessToken(clientId, clientSecret);
    fetchOptions.headers.Authorization = `Bearer ${newToken}`;
    response = await nodeFetch(url, fetchOptions);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Naver API Error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * 상품 주문 목록 조회
 */
async function getProductOrders(clientId, clientSecret, options) {
  const { from, to, rangeType = 'PAYED_DATETIME', pageSize = 300, page = 1 } = options;

  return naverRequest('GET', '/external/v1/pay-order/seller/product-orders', clientId, clientSecret, undefined, {
    from,
    to,
    rangeType,
    pageSize: pageSize.toString(),
    page: page.toString(),
  });
}

// ============================================================================
// 동기화 로직
// ============================================================================

// 제외할 주문 상태 (취소/반품)
const EXCLUDED_STATUSES = new Set([
  'CANCELED',
  'RETURNED',
  'CANCELED_BY_NOPAYMENT',
]);

/**
 * 단일 날짜 범위 주문 조회
 */
async function fetchOrdersForDateRange(clientId, clientSecret, accountName, from, to) {
  try {
    const response = await getProductOrders(clientId, clientSecret, { from, to, rangeType: 'PAYED_DATETIME', pageSize: 300, page: 1 });
    const contents = response.data?.contents || [];

    return contents
      .filter((item) => !EXCLUDED_STATUSES.has(item.content.productOrder.productOrderStatus))
      .map((item) => ({
        productOrderId: item.productOrderId,
        orderId: item.content.order.orderId,
        orderDate: item.content.order.orderDate,
        paymentDate: item.content.order.paymentDate,
        productName: item.content.productOrder.productName,
        productOption: item.content.productOrder.productOption || null,
        productId: item.content.productOrder.productId || null,
        quantity: item.content.productOrder.quantity,
        totalPaymentAmount: item.content.productOrder.totalPaymentAmount,
        productOrderStatus: item.content.productOrder.productOrderStatus,
        accountName,
        raw: item,
      }));
  } catch (err) {
    console.error(`  ⚠️  [${accountName}] ${from} 조회 실패:`, err.message);
    return [];
  }
}

/**
 * 상품 매핑 로드 (product_mappings + products 이름 매칭)
 */
async function loadNaverMappings(supabase) {
  const map = new Map();

  // 1. product_mappings 테이블
  const { data: mappings } = await supabase
    .from('product_mappings')
    .select('product_id, external_product_name, external_option_name')
    .eq('marketplace', 'naver')
    .eq('is_active', true);

  mappings?.forEach((m) => {
    if (m.external_product_name) {
      if (m.external_option_name) {
        map.set(`${m.external_product_name}|||${m.external_option_name}`, m.product_id);
      }
      map.set(m.external_product_name, m.product_id);
    }
  });

  // 2. products 이름 기반 fallback
  const { data: products } = await supabase.from('products').select('id, name').eq('is_active', true);

  products?.forEach((p) => {
    if (!map.has(p.name)) map.set(p.name, p.id);
  });

  return map;
}

function findProductId(mappingMap, productName, productOption) {
  if (productOption) {
    const keyWithOption = `${productName}|||${productOption}`;
    if (mappingMap.has(keyWithOption)) return mappingMap.get(keyWithOption);
  }
  if (mappingMap.has(productName)) return mappingMap.get(productName);
  return null;
}

// ============================================================================
// 메인
// ============================================================================

async function main() {
  const startTime = Date.now();
  validateEnv();
  const { from, to } = parseArgs();

  console.log(`\n🔄 네이버 주문 동기화 시작`);
  console.log(`   기간: ${from} → ${to}`);
  console.log(`   시작: ${new Date().toISOString()}\n`);

  // Supabase 클라이언트
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // 네이버 계정
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const accountName = 'KIDL 키들';

  // 날짜 범위 분할 (24시간 단위 - 네이버 API 제한)
  const dateRanges = splitDateRange(from, to);
  console.log(`📅 ${dateRanges.length}일 분할 조회\n`);

  // 주문 수집
  const allOrders = [];
  const batchSize = 5;

  for (let i = 0; i < dateRanges.length; i += batchSize) {
    const batch = dateRanges.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((range) => fetchOrdersForDateRange(clientId, clientSecret, accountName, range.from, range.to)),
    );
    allOrders.push(...batchResults.flat());

    // 진행상황 표시
    const progress = Math.min(i + batchSize, dateRanges.length);
    process.stdout.write(`\r   조회 진행: ${progress}/${dateRanges.length}일`);

    // Rate limiting
    if (i + batchSize < dateRanges.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  console.log('');

  // 중복 제거 (productOrderId 기준)
  const uniqueMap = new Map(allOrders.map((o) => [o.productOrderId, o]));
  const orders = Array.from(uniqueMap.values());

  console.log(`\n📦 총 ${orders.length}건 주문 수집 (중복 제거 후)`);

  if (orders.length === 0) {
    console.log('✅ 동기화할 주문이 없습니다.');
    process.exit(0);
  }

  // 상품 매핑 로드
  const mappingMap = await loadNaverMappings(supabase);
  console.log(`🗺️  상품 매핑 ${mappingMap.size}건 로드됨`);

  // Upsert (50건씩 배치)
  let synced = 0;
  const errors = [];
  const unmappedMap = new Map();
  const BATCH_SIZE = 50;

  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE);

    const rows = batch.map((order) => {
      const productId = findProductId(mappingMap, order.productName, order.productOption);

      if (!productId) {
        const key = `${order.productName}|||${order.productOption || ''}`;
        if (!unmappedMap.has(key)) {
          unmappedMap.set(key, { productName: order.productName, productOption: order.productOption, count: 0 });
        }
        unmappedMap.get(key).count += order.quantity;
      }

      return {
        product_order_id: order.productOrderId,
        order_id: order.orderId,
        payment_date: order.paymentDate || order.orderDate,
        product_id: productId,
        product_name: order.productName,
        product_option: order.productOption,
        quantity: order.quantity,
        total_payment_amount: order.totalPaymentAmount,
        channel_product_id: order.productId,
        status: order.productOrderStatus,
        account_name: order.accountName,
        raw_data: order.raw,
        synced_at: new Date().toISOString(),
      };
    });

    const { data, error } = await supabase
      .from('naver_orders')
      .upsert(rows, { onConflict: 'product_order_id', ignoreDuplicates: false })
      .select('product_order_id');

    if (error) {
      console.error(`  ⚠️  Upsert 실패:`, error.message);
      errors.push(error.message);
    } else {
      synced += data?.length || 0;
    }
  }

  // 동기화 로그 기록
  try {
    await supabase.from('api_sync_logs').insert({
      channel: 'naver',
      sync_type: 'naver_orders',
      status: errors.length > 0 ? 'partial' : 'success',
      records_count: synced,
      error_message: errors.length > 0 ? errors.join('; ') : null,
      completed_at: new Date().toISOString(),
    });
  } catch {
    // api_sync_logs 테이블 없으면 무시
  }

  // 결과 출력
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const unmappedList = Array.from(unmappedMap.values());

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 동기화 완료 (${elapsed}s)`);
  console.log(`   Upsert: ${synced}건`);
  console.log(`   매핑 완료: ${synced - unmappedList.reduce((s, u) => s + u.count, 0)}건`);

  if (unmappedList.length > 0) {
    console.log(`\n⚠️  매핑 안 된 상품 ${unmappedList.length}종:`);
    unmappedList.forEach((u) => {
      const opt = u.productOption ? ` [${u.productOption}]` : '';
      console.log(`   - ${u.productName}${opt} (${u.count}건)`);
    });
  }

  if (errors.length > 0) {
    console.log(`\n❌ 에러 ${errors.length}건:`);
    errors.forEach((e) => console.log(`   - ${e}`));
    process.exit(1);
  }

  console.log('');
}

main().catch((err) => {
  console.error('\n💥 치명적 오류:', err);
  process.exit(1);
});
