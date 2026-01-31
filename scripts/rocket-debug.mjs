import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';

const vendorId = process.env.COUPANG_VENDOR_ID;
const accessKey = process.env.COUPANG_ACCESS_KEY;
const secretKey = process.env.COUPANG_SECRET_KEY;

const path = `/v2/providers/rg_open_api/apis/api/v1/vendors/${vendorId}/rg/orders`;
// Test range vs single day
const query = 'paidDateFrom=20260126&paidDateTo=20260128';
const fullPath = `${path}?${query}`;

const datetime = new Date().toISOString().substr(2, 17).replace(/[-:]/g, '') + 'Z';
const message = datetime + 'GET' + path + query;
const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
const auth = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

console.log('VendorId:', vendorId);
console.log('URL:', `https://api-gateway.coupang.com${fullPath}`);
console.log('Proxy:', process.env.PROXY_URL);

const agent = new HttpsProxyAgent(process.env.PROXY_URL);

const res = await fetch(`https://api-gateway.coupang.com${fullPath}`, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json;charset=UTF-8',
    'Authorization': auth,
  },
  agent,
});

console.log('Status:', res.status);
const body = await res.text();
console.log('Response:', body.substring(0, 1000));
