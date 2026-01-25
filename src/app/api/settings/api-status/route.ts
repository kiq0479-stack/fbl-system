import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCoupangConfig, getRocketGrowthInventory } from '@/lib/coupang';

interface ApiStatus {
  name: string;
  description: string;
  status: 'connected' | 'error' | 'not_configured';
  lastCheck: string;
  details?: Record<string, string>;
  error?: string;
}

export async function GET() {
  const apis: ApiStatus[] = [];
  const now = new Date().toISOString();

  // 1. Supabase 상태 확인
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      apis.push({
        name: 'Supabase',
        description: '데이터베이스 및 인증 서비스',
        status: 'not_configured',
        lastCheck: now,
        details: {
          'URL': '미설정',
          'Key': '미설정',
        },
      });
    } else {
      const supabase = await createClient();
      const { error } = await supabase.from('system_users').select('id').limit(1);

      apis.push({
        name: 'Supabase',
        description: '데이터베이스 및 인증 서비스',
        status: error ? 'error' : 'connected',
        lastCheck: now,
        details: {
          'Project': supabaseUrl.split('//')[1]?.split('.')[0] || 'Unknown',
          'Region': 'ap-northeast-1',
        },
        error: error?.message,
      });
    }
  } catch (error) {
    apis.push({
      name: 'Supabase',
      description: '데이터베이스 및 인증 서비스',
      status: 'error',
      lastCheck: now,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // 2. 쿠팡 API 상태 확인
  try {
    const vendorId = process.env.COUPANG_VENDOR_ID;
    const accessKey = process.env.COUPANG_ACCESS_KEY;
    const secretKey = process.env.COUPANG_SECRET_KEY;

    if (!vendorId || !accessKey || !secretKey) {
      apis.push({
        name: '쿠팡 Open API',
        description: '쿠팡 마켓플레이스 연동 (로켓그로스)',
        status: 'not_configured',
        lastCheck: now,
        details: {
          'Vendor ID': vendorId ? `${vendorId.substring(0, 4)}****` : '미설정',
          'Access Key': accessKey ? `${accessKey.substring(0, 8)}****` : '미설정',
          'Secret Key': secretKey ? '설정됨' : '미설정',
        },
      });
    } else {
      // 실제 API 호출로 연결 테스트
      const config = getCoupangConfig();
      const response = await getRocketGrowthInventory(config, vendorId, {});

      // 쿠팡 API는 code가 숫자 0 또는 문자열 "SUCCESS"일 수 있음
      // data 배열이 있으면 성공으로 간주
      const isSuccess = response.data && Array.isArray(response.data);

      apis.push({
        name: '쿠팡 Open API',
        description: '쿠팡 마켓플레이스 연동 (로켓그로스)',
        status: isSuccess ? 'connected' : 'error',
        lastCheck: now,
        details: {
          'Vendor ID': `${vendorId.substring(0, 4)}****`,
          'Access Key': `${accessKey.substring(0, 8)}****`,
          'API Version': 'v2',
        },
        error: isSuccess ? undefined : `API Response: ${JSON.stringify(response).substring(0, 100)}`,
      });
    }
  } catch (error) {
    apis.push({
      name: '쿠팡 Open API',
      description: '쿠팡 마켓플레이스 연동 (로켓그로스)',
      status: 'error',
      lastCheck: now,
      details: {
        'Vendor ID': process.env.COUPANG_VENDOR_ID ? `${process.env.COUPANG_VENDOR_ID.substring(0, 4)}****` : '미설정',
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // 3. 프록시 서버 상태 (설정된 경우)
  const proxyUrl = process.env.PROXY_URL;
  if (proxyUrl) {
    apis.push({
      name: '프록시 서버',
      description: 'API 요청 프록시 (IP 우회용)',
      status: 'connected',
      lastCheck: now,
      details: {
        'Host': proxyUrl.split('@')[1]?.split(':')[0] || 'Unknown',
        'Type': 'HTTPS',
      },
    });
  }

  // 4. Vercel 배포 정보
  apis.push({
    name: 'Vercel',
    description: '호스팅 및 배포 서비스',
    status: 'connected',
    lastCheck: now,
    details: {
      'Environment': process.env.NODE_ENV || 'development',
      'Region': process.env.VERCEL_REGION || 'Unknown',
    },
  });

  return NextResponse.json({
    success: true,
    apis,
    checkedAt: now,
  });
}
