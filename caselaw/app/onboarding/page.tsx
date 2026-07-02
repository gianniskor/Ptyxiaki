import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation'
import OnboardingForm from './onboarding-form'

export const metadata: Metadata = { title: 'Complete your profile' }

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  // Must be authenticated
  if (!data?.claims) redirect('/auth/login')

  // If profile already has a first name, onboarding is done
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, avatar_url, organisations(name)')
    .eq('id', data.claims.sub)
    .single()

  if (profile?.first_name) redirect('/')

  const organisationName =
    (Array.isArray(profile?.organisations)
      ? profile?.organisations[0]?.name
      : (profile?.organisations as unknown as { name: string } | null)?.name) ?? null

  // Pull pre-fill data from auth user_metadata (populated by Google OAuth)
  const { data: userData } = await supabase.auth.getUser()
  const meta = userData?.user?.user_metadata ?? {}

  const initialData = {
    firstName: (meta.given_name ?? meta.name?.split(' ')[0] ?? '') as string,
    lastName: (meta.family_name ?? (meta.name?.split(' ').slice(1).join(' ') ?? '')) as string,
    // Prefer existing profile avatar_url (set by trigger), fall back to Google picture
    avatarUrl: (profile?.avatar_url ?? meta.avatar_url ?? meta.picture ?? null) as string | null,
  }

  return (
    <BackgroundGradientAnimation interactive>
      <div className="absolute z-50 inset-0 flex items-center justify-center px-4">
        <OnboardingForm
          claims={data.claims as { sub: string; email?: string; [key: string]: unknown }}
          initialData={initialData}
          organisationName={organisationName}
        />
      </div>
    </BackgroundGradientAnimation>
  )
}
