import { NextResponse } from 'next/server';
import { getCoupangConfig, coupangRequest } from '@/lib/coupang';
import nodeFetch from 'node-fetch';
import crypto from 'crypto';

export const maxDuration = 30;

function makeAuth(method: string, path: string, accessKey: string, secretKey: string) {
  const [basePath, qs] = path.includes('?') ? path.split('?', 2) : [path, ''];
  const datetime = new Date().toISOString().substr(2, 17).replace(/[-:]/g, '') + 'Z';
  const message = datetime + method + basePath + qs;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

/**
 * Test Coupang API WITHOUT proxy.
 * GET /api/coupang/test-no-proxy
 */
export async function GET() {
  const config = getCoupangConfig();
  const apiPath = `/v2/providers/openapi/apis/api/v4/vendors/${config.vendorId}/returnShippingCenters`;
  const fullUrl = `https://api-gateway.coupang.com${apiPath}`;

  const results: Record<string, any> = {};

  // Test 1: Direct connection (no proxy)
  try {
    const auth = makeAuth('GET', apiPath, config.accessKey, config.secretKey);
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await nodeFetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json;charset=UTF-8',
      },
      signal: controller.signal as any,
    });

    clearTimeout(timeout);
    const elapsed = Date.now() - start;
    const body = await response.text();

    results.direct = {
      success: response.ok,
      status: response.status,
      elapsed_ms: elapsed,
      body_preview: body.substring(0, 300),
    };
  } catch (err: any) {
    results.direct = {
      success: false,
      error: err.message,
    };
  }

  // Test 2: Via existing coupangRequest (uses proxy if configured)
  try {
    const start = Date.now();
    const data = await coupangRequest('GET', apiPath, config);
    results.via_proxy = {
      success: true,
      elapsed_ms: Date.now() - start,
    };
  } catch (err: any) {
    results.via_proxy = {
      success: false,
      error: err.message,
    };
  }

  results.proxy_url = process.env.PROXY_URL ? '(set)' : '(not set)';
  results.vercel_region = process.env.VERCEL_REGION || 'unknown';

  return NextResponse.json(results);
}
