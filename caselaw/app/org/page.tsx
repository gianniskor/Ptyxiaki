import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OrgDashboard from './org-dashboard'

export const metadata = { title: 'Ο οργανισμός μου' }

export default async function OrgPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) redirect('/auth/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('organisation_id, org_role, status, organisations(name)')
    .eq('id', claimsData.claims.sub)
    .single()

  // Only approved organisation admins may access this page.
  if (me?.org_role !== 'org_admin' || me?.status !== 'approved' || !me?.organisation_id) {
    redirect('/')
  }

  const org = me.organisations as { name: string } | { name: string }[] | null
  const orgName = Array.isArray(org) ? (org[0]?.name ?? '') : (org?.name ?? '')

  const { data: membersRaw } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, username, status, org_role, updated_at')
    .eq('organisation_id', me.organisation_id)
    .order('status', { ascending: true })

  const members = (membersRaw ?? []).map((m) => ({
    id: m.id,
    first_name: m.first_name,
    last_name: m.last_name,
    username: m.username,
    status: m.status ?? 'pending',
    org_role: m.org_role ?? null,
    updated_at: m.updated_at,
  }))

  return (
    <OrgDashboard
      organisationId={me.organisation_id}
      organisationName={orgName}
      currentUserId={claimsData.claims.sub}
      members={members}
    />
  )
}
