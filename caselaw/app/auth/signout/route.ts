import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'

async function signOut(req: NextRequest) {
  const supabase = await createClient()

  // Check if a user's logged in
  const { data: claimsData } = await supabase.auth.getClaims()

  if (claimsData?.claims) {
    await supabase.auth.signOut()
  }

  revalidatePath('/', 'layout')
  return NextResponse.redirect(new URL('/auth/login', req.url), {
    status: 302,
  })
}

export async function POST(req: NextRequest) {
  return signOut(req)
}

// Allow plain link navigations (GET) to sign out as well, e.g. the
// "Αποσύνδεση" link on the pending-approval page. Without this a GET
// request to a POST-only route returns 405 Method Not Allowed.
export async function GET(req: NextRequest) {
  return signOut(req)
}
