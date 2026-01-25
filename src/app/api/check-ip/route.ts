import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // 외부 서비스를 통해 현재 서버의 outbound IP 확인
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    
    return NextResponse.json({
      serverIP: data.ip,
      message: '이 IP를 쿠팡 Wing API 허용 IP에 추가하세요',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'IP 확인 실패' },
      { status: 500 }
    );
  }
}
