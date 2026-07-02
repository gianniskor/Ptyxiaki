"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { UserDropdown } from '@/components/ui/user-dropdown';

export function AuthButton() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null; role: string | null; org_role: string | null } | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setUser(data.session?.user ?? null);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !user) { setProfile(null); return; }

    supabase
      .from('profiles')
      .select('first_name, last_name, avatar_url, role, org_role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const first = data.first_name ?? '';
        const last = data.last_name ?? '';
        const display_name = (first + (last ? ' ' + last : '')).trim() || null;
        setProfile({ display_name, avatar_url: data.avatar_url ?? null, role: data.role ?? null, org_role: data.org_role ?? null });
      });
  }, [supabase, user]);

  if (loading) {
    return <div className="h-9 w-28 rounded-full bg-white/10 animate-pulse" />;
  }

  if (!supabase) {
    return (
      <Link
        href="/auth/login"
        className="px-4 py-2 rounded-full border border-yellow-500/40 text-yellow-300 text-sm hover:bg-yellow-500/10 transition"
      >
        Sign in
      </Link>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/auth/login"
          className="px-4 py-2 rounded-full border border-gray-700 text-gray-200 text-sm hover:border-gray-500 transition"
        >
          Sign in
        </Link>
        <Link
          href="/auth/register"
          className="px-4 py-2 rounded-full bg-white text-black text-sm font-medium hover:bg-gray-200 transition"
        >
          Register
        </Link>
      </div>
    );
  }

  return (
    <UserDropdown
      email={user.email ?? ''}
      displayName={profile?.display_name}
      avatarUrl={profile?.avatar_url}
      isAdmin={profile?.role === 'admin'}
      isOrgAdmin={profile?.org_role === 'org_admin'}
      // in case of need and this thing doesn't work use this -> onSignOut={async () => { await supabase?.auth.signOut(); router.push('/auth/login'); }}
      onSignOut={async () => {
  try {
    await supabase?.auth.signOut();
  } finally {
    router.push('/auth/login');
  }
}}
    />
  );
}
