'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Shield } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function AdminNavLink() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user?.id;
      if (!userId || !mounted) return;

      supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
        .then(({ data: profile }) => {
          if (mounted) setIsAdmin(profile?.role === 'admin');
        });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id;
      if (!userId) { setIsAdmin(false); return; }
      supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
        .then(({ data: profile }) => {
          if (mounted) setIsAdmin(profile?.role === 'admin');
        });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  if (!isAdmin) return null;

  return (
    <Link
      href="/admin"
      className="px-6 py-2.5 rounded-full bg-yellow-500/15 text-yellow-300 text-sm font-medium flex items-center gap-1.5"
    >
      <Shield className="w-3.5 h-3.5" />Admin
    </Link>
  );
}
