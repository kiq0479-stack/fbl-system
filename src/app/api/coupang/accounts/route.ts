import { NextResponse } from 'next/server';
import { getCoupangAccounts } from '@/lib/coupang';

// 쿠팡 계정 목록 조회 API
export async function GET() {
  try {
    const accounts = getCoupangAccounts();
    
    // 보안상 accessKey, secretKey는 마스킹 처리
    const safeAccounts = accounts.map(account => ({
      id: account.id,
      name: account.name,
      vendorId: account.vendorId,
      accessKey: maskKey(account.accessKey),
    }));

    return NextResponse.json({
      success: true,
      accounts: safeAccounts,
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}
