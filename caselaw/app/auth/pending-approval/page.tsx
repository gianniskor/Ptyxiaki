import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Clock, XCircle } from 'lucide-react'
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation'
import PendingApprovalWatcher from './pending-approval-watcher'

export default async function PendingApprovalPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('status, role')
    .eq('id', data.claims.sub)
    .single()

  // Already approved (or admin) → no need to wait here.
  if (profile?.role === 'admin' || profile?.status === 'approved') {
    redirect('/')
  }

  const rejected = profile?.status === 'rejected'

  return (
    <div className="min-h-screen font-sans text-white flex items-center justify-center px-4">
      {!rejected && <PendingApprovalWatcher userId={data.claims.sub} />}
      <div className="fixed inset-0 -z-10">
        <BackgroundGradientAnimation interactive />
        <div className="absolute inset-0 bg-black/50" />
      </div>

      <div className="w-full max-w-md text-center">
        <div className="bg-[#151518] border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex justify-center mb-5">
            {rejected
              ? <XCircle className="w-12 h-12 text-red-400" />
              : <Clock className="w-12 h-12 text-yellow-400" />}
          </div>

          <h1 className="text-2xl font-bold mb-3">
            {rejected ? 'Ο λογαριασμός σας δεν εγκρίθηκε' : 'Αναμονή έγκρισης λογαριασμού'}
          </h1>

          <p className="text-sm text-gray-400 leading-relaxed">
            {rejected
              ? 'Το αίτημα για τον λογαριασμό σας δεν εγκρίθηκε. Παρακαλώ επικοινωνήστε με τον διαχειριστή της οργάνωσής σας για περισσότερες πληροφορίες.'
              : 'Ο λογαριασμός σας έχει δημιουργηθεί και περιμένει την έγκριση ενός διαχειριστή. Θα μπορείτε να συνδεθείτε μόλις εγκριθεί.'}
          </p>

          <div className="flex flex-col gap-3 mt-7">
            <Link
              href="/account"
              className="px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-gray-300 text-sm hover:bg-white/10 transition"
            >
              Προβολή / Ολοκλήρωση του προφίλ σας
            </Link>
            <Link
              href="/auth/signout"
              prefetch={false}
              className="px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-gray-400 text-sm hover:bg-white/10 transition"
            >
                Αποσύνδεση
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
