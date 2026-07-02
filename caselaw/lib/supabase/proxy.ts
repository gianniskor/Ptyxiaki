import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims

  // Signup-approval gate: block non-approved users from the app until an
  // admin approves them. Auth, error and onboarding routes stay accessible.
  if (claims?.sub) {
    const path = request.nextUrl.pathname
    const isExempt =
      path.startsWith('/auth') ||
      path.startsWith('/error') ||
      path.startsWith('/onboarding') ||
      path.startsWith('/account')

    if (!isExempt) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('status, role')
        .eq('id', claims.sub)
        .single()

      if (profile && profile.role !== 'admin' && profile.status !== 'approved') {
        const url = request.nextUrl.clone()
        url.pathname = '/auth/pending-approval'
        url.search = ''
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
