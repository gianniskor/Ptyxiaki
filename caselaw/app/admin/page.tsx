import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import AdminDashboard from './admin-dashboard'

const BACKEND = 'http://localhost:8000'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: countData } = await supabase.rpc('get_user_count')
  const { data: profilesRaw } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, username, role, org_role, updated_at, status, organisation_id, organisations(name)')
    .order('updated_at', { ascending: false })

  // Map each user id to its auth email (only available via the service role).
  const emailById: Record<string, string> = {}
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (serviceKey && url) {
    const admin = createAdminClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    for (let page = 1; ; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (error || !data?.users?.length) break
      for (const u of data.users) emailById[u.id] = u.email ?? ''
      if (data.users.length < 1000) break
    }
  }

  const profiles = (profilesRaw ?? []).map((p) => {
    const org = p.organisations as { name: string } | { name: string }[] | null
    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      username: p.username,
      email: emailById[p.id] ?? null,
      role: p.role,
      org_role: p.org_role ?? null,
      updated_at: p.updated_at,
      status: p.status ?? 'approved',
      organisation_id: p.organisation_id ?? null,
      organisation_name: Array.isArray(org) ? (org[0]?.name ?? null) : (org?.name ?? null),
    }
  })

  // Load organisations from Supabase
  const { data: organisations } = await supabase
    .from('organisations')
    .select('id, name')
    .order('name', { ascending: true })


  return (
    <AdminDashboard
      userCount={countData ?? 0}
      profiles={profiles ?? []}
      organisations={organisations ?? []}
    />
  )
}
