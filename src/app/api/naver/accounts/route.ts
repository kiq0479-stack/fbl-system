import { NextResponse } from 'next/server';
import { getNaverAccounts } from '@/lib/naver';

export async function GET() {
  try {
    const accounts = getNaverAccounts();
    
    // 민감 정보 제외하고 반환
    const safeAccounts = accounts.map(account => ({
      id: account.id,
      name: account.name,
      storeName: account.storeName,
    }));

    return NextResponse.json({
      code: 'SUCCESS',
      message: 'OK',
      data: safeAccounts,
      count: safeAccounts.length,
    });
  } catch (error) {
    console.error('Naver Accounts Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
