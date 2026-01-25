import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    // 현재 로그인한 사용자 확인
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('fbl_session');
    
    if (!sessionCookie?.value) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    let session;
    try {
      session = JSON.parse(sessionCookie.value);
    } catch {
      return NextResponse.json({ error: '세션이 유효하지 않습니다.' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: '현재 비밀번호와 새 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: '새 비밀번호는 6자 이상이어야 합니다.' }, { status: 400 });
    }

    const supabase = await createClient();

    // 현재 비밀번호 확인
    const { data: user, error: fetchError } = await supabase
      .from('system_users')
      .select('id, password')
      .eq('id', session.id)
      .single();

    if (fetchError || !user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 비밀번호 검증 (실제 서비스에서는 해시 비교)
    const userData = user as { id: string; password: string };
    if (userData.password !== currentPassword) {
      return NextResponse.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, { status: 400 });
    }

    // 비밀번호 변경
    const { error: updateError } = await (supabase
      .from('system_users') as any)
      .update({ password: newPassword })
      .eq('id', session.id);

    if (updateError) {
      return NextResponse.json({ error: '비밀번호 변경에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '비밀번호가 변경되었습니다.' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
