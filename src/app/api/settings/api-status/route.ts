import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCoupangAccounts, getRocketGrowthInventory } from '@/lib/coupang';

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

  // 2. 쿠팡 API 상태 확인 - 모든 계정
  const accounts = getCoupangAccounts();
  
  for (const account of accounts) {
    try {
      const config = {
        vendorId: account.vendorId,
        accessKey: account.accessKey,
        secretKey: account.secretKey,
      };
      
      const response = await getRocketGrowthInventory(config, account.vendorId, {});
      const isSuccess = response.data && Array.isArray(response.data);

      apis.push({
        name: `쿠팡 Open API (${account.name})`,
        description: `쿠팡 마켓플레이스 연동 - ${account.name}`,
        status: isSuccess ? 'connected' : 'error',
        lastCheck: now,
        details: {
          'Vendor ID': account.vendorId,
          'Access Key': account.accessKey,
          'API Version': 'v2',
        },
        error: isSuccess ? undefined : `API Response: ${JSON.stringify(response).substring(0, 200)}`,
      });
    } catch (error) {
      apis.push({
        name: `쿠팡 Open API (${account.name})`,
        description: `쿠팡 마켓플레이스 연동 - ${account.name}`,
        status: 'error',
        lastCheck: now,
        details: {
          'Vendor ID': account.vendorId,
          'Access Key': account.accessKey,
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  if (accounts.length === 0) {
    apis.push({
      name: '쿠팡 Open API',
      description: '쿠팡 마켓플레이스 연동',
      status: 'not_configured',
      lastCheck: now,
      details: {
        'Vendor ID': '미설정',
        'Access Key': '미설정',
      },
    });
  }

  // 3. 프록시 서버 상태
  const proxyUrl = process.env.PROXY_URL;
  if (proxyUrl) {
    // http://IP:PORT 또는 http://user:pass@IP:PORT 형식 파싱
    let host = 'Unknown';
    let port = 'Unknown';
    
    try {
      const url = new URL(proxyUrl);
      host = url.hostname;
      port = url.port;
    } catch {
      // URL 파싱 실패 시 간단한 파싱
      const match = proxyUrl.match(/@?([0-9.]+):(\d+)/);
      if (match) {
        host = match[1];
        port = match[2];
      }
    }

    apis.push({
      name: '프록시 서버',
      description: 'API 요청 프록시 (고정 IP)',
      status: 'connected',
      lastCheck: now,
      details: {
        'Host': host,
        'Port': port,
        'Type': 'HTTP Proxy',
      },
    });
  } else {
    apis.push({
      name: '프록시 서버',
      description: 'API 요청 프록시 (고정 IP)',
      status: 'not_configured',
      lastCheck: now,
      details: {
        'PROXY_URL': '미설정',
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
