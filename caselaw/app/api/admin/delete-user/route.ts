import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Permanently deletes a user account (auth user + profile).
 * Only the platform admin may call this.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const callerId = claimsData?.claims?.sub
  if (!callerId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: caller } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .single()

  if (caller?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let userId: string
  try {
    const body = await request.json()
    userId = body.userId
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }
  if (userId === callerId) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) {
    return NextResponse.json(
      { error: 'Server is missing a required environment variable.' },
      { status: 500 },
    )
  }

  const admin = createAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Clean up rows that reference the user before removing the auth account.
  // This prevents "Database error deleting user" when foreign keys to
  // auth.users / profiles do not cascade. Runs with the service role, so RLS
  // does not block it.
  await admin.from('invite_tokens').update({ used_by: null }).eq('used_by', userId)
  await admin.from('profiles').delete().eq('id', userId)

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
