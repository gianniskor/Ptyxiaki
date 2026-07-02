import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const invite = searchParams.get('invite');
  let next = searchParams.get('next') ?? '/';

  if (!next.startsWith('/')) {
    next = '/';
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (invite) {
        await supabase.rpc('claim_invite', { p_token: invite });
      }
      const forwardedHost = request.headers.get('x-forwarded-host');
      const forwardedProto = request.headers.get('x-forwarded-proto');
      if (forwardedHost) {
        const proto = forwardedProto ?? new URL(origin).protocol.replace(':', '');
        return NextResponse.redirect(`${proto}://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
