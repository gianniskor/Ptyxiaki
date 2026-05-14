import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AccountForm from './account-form'

export default async function AccountPage() {
  const supabase = await createClient()

  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) {
    redirect('/auth/login')
  }

  return <AccountForm claims={data.claims} />
}
