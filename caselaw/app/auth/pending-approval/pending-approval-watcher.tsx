'use client'

import { useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * Polls the current user's approval status while they sit on the
 * pending-approval screen. As soon as an admin approves them, the user is
 * sent into the app automatically — no manual refresh required.
 */
export default function PendingApprovalWatcher({ userId }: { userId: string }) {
  const done = useRef(false)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) return

    let timer: ReturnType<typeof setInterval> | undefined

    const check = async () => {
      if (done.current) return
      const { data } = await supabase
        .from('profiles')
        .select('status, role')
        .eq('id', userId)
        .single()

      // Re-check the guard after the await: another in-flight poll may have
      // already triggered the navigation. Without this, multiple rapid
      // navigations fire and Chrome throttles them, so the page never loads.
      if (done.current) return

      if (data && (data.role === 'admin' || data.status === 'approved')) {
        done.current = true
        if (timer) clearInterval(timer)
        // A single full-page navigation re-runs the middleware once with the
        // fresh (approved) profile, instead of an SPA replace + refresh burst.
        window.location.assign('/')
      }
    }

    timer = setInterval(check, 4000)
    check()

    return () => {
      if (timer) clearInterval(timer)
    }
  }, [userId])

  return null
}
