import { createClient } from '@/lib/supabase/server'
import AdminDashboard from './admin-dashboard'

const BACKEND = 'http://localhost:8000'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: countData } = await supabase.rpc('get_user_count')
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, username, role, updated_at')
    .order('updated_at', { ascending: false })

  // Load courts from backend
  let courts: { id: string; abbreviation: string; full_name: string; facet_label: string | null }[] = []
  try {
    const res = await fetch(`${BACKEND}/api/courts`, { cache: 'no-store' })
    if (res.ok) courts = await res.json()
  } catch {

  }

  return (
    <AdminDashboard
      userCount={countData ?? 0}
      profiles={profiles ?? []}
      courts={courts}
    />
  )
}
