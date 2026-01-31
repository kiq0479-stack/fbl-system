import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';

function getAuth(method, basePath, query, accessKey, secretKey) {
  const dt = new Date().toISOString().substr(2,17).replace(/[-:]/g,'')+'Z';
  const sig = crypto.createHmac('sha256', secretKey).update(dt+method+basePath+query).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${dt}, signature=${sig}`;
}

async function coupangGet(fullPath, config) {
  const [bp, q] = fullPath.includes('?') ? fullPath.split('?') : [fullPath, ''];
  const auth = getAuth('GET', bp, q, config.accessKey, config.secretKey);
  const agent = process.env.PROXY_URL ? new HttpsProxyAgent(process.env.PROXY_URL) : undefined;
  const res = await fetch(`https://api-gateway.coupang.com${fullPath}`, {
    headers: { 'Content-Type': 'application/json;charset=UTF-8', Authorization: auth }, agent
  });
  return res.json();
}

const vendorId = process.env.COUPANG_VENDOR_ID;
const config = { vendorId, accessKey: process.env.COUPANG_ACCESS_KEY, secretKey: process.env.COUPANG_SECRET_KEY };

// 테스트 1: 단일 날짜 (from==to)
console.log('=== 테스트 1: from==to (2026-01-30) ===');
const r1 = await coupangGet(`/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets?createdAtFrom=2026-01-30&createdAtTo=2026-01-30&status=FINAL_DELIVERY&maxPerPage=50`, config);
console.log(`  FINAL_DELIVERY: ${r1.data?.length || 0}건, nextToken: ${r1.nextToken || 'null'}`);

// 테스트 2: 범위 (from < to)
console.log('\n=== 테스트 2: 범위 (2026-01-30 ~ 2026-01-31) ===');
const r2 = await coupangGet(`/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets?createdAtFrom=2026-01-30&createdAtTo=2026-01-31&status=FINAL_DELIVERY&maxPerPage=50`, config);
console.log(`  FINAL_DELIVERY: ${r2.data?.length || 0}건, nextToken: ${r2.nextToken || 'null'}`);
if (r2.data?.length) {
  r2.data.slice(0,3).forEach(o => console.log(`    orderedAt: ${o.orderedAt}, items: ${o.orderItems?.length}`));
}

// 테스트 3: 이전 데이터 있는 날짜 확인 (1/28)
console.log('\n=== 테스트 3: 단일 날짜 (2026-01-28) ===');
for (const status of ['ACCEPT','INSTRUCT','DEPARTURE','DELIVERING','FINAL_DELIVERY']) {
  const r = await coupangGet(`/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets?createdAtFrom=2026-01-28&createdAtTo=2026-01-28&status=${status}&maxPerPage=50`, config);
  if (r.data?.length) console.log(`  ${status}: ${r.data.length}건`);
}

// 테스트 4: 범위로 1/28~1/29
console.log('\n=== 테스트 4: 범위 (2026-01-28 ~ 2026-01-29) ===');
let total4 = 0;
for (const status of ['ACCEPT','INSTRUCT','DEPARTURE','DELIVERING','FINAL_DELIVERY']) {
  const r = await coupangGet(`/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets?createdAtFrom=2026-01-28&createdAtTo=2026-01-29&status=${status}&maxPerPage=50`, config);
  if (r.data?.length) { console.log(`  ${status}: ${r.data.length}건`); total4 += r.data.length; }
}
console.log(`  합계: ${total4}건`);
