import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

interface SystemUser {
  id: string;
  username: string;
  role: string;
  name: string;
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: '아이디와 비밀번호를 입력하세요' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 사용자 조회
    const { data, error } = await supabase
      .from('system_users')
      .select('id, username, role, name')
      .eq('username', username)
      .eq('password', password)
      .single();

    const user = data as SystemUser | null;

    if (error || !user) {
      return NextResponse.json(
        { error: '아이디 또는 비밀번호가 올바르지 않습니다' },
        { status: 401 }
      );
    }

    // 세션 쿠키 설정 (7일 유효)
    const sessionData = JSON.stringify({
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
    });

    const cookieStore = await cookies();
    cookieStore.set('fbl_session', sessionData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7일
      path: '/',
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
      },
    });
  } catch {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
