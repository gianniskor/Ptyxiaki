"use client";


import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Building2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation';

export default function RegisterPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Invite / referral token (?token=…) — determines the user's organisation.
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgChecking, setOrgChecking] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return;
    setInviteToken(token);
    if (!supabase) return;
    setOrgChecking(true);
    supabase
      .rpc('get_invite_org', { p_token: token })
      .then(({ data }) => setOrgName((data as string | null) ?? null))
      .then(() => setOrgChecking(false));
  }, [supabase]);

  const notConfigured = () => {
    setError('Add environment variables to enable auth.');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!supabase) { notConfigured(); return; }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        data: inviteToken ? { invite_token: inviteToken } : undefined,
      },
    });
    setLoading(false);

    if (signUpError) {
      const msg = signUpError.message.toLowerCase();
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
        setError('Υπάρχει ήδη λογαριασμός με αυτό το email. Δοκιμάστε να συνδεθείτε.');
      } else {
        setError(signUpError.message);
      }
      return;
    }

    // Supabase obfuscates "email already registered" by returning a fake user
    // with an empty `identities` array (and no session) instead of an error.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setError('Υπάρχει ήδη λογαριασμός με αυτό το email. Δοκιμάστε να συνδεθείτε.');
      return;
    }

    if (!data.session) {
      setMessage('Ο λογαριασμός δημιουργήθηκε, ελέγξτε το email σας για να τον επιβεβαιώσετε. Κοιταξτε και τον φάκελο ανεπιθύμητης αλληλογραφίας (spam).');
    } else {
      setMessage('Ο λογαριασμός δημιουργήθηκε. Έχετε συνδεθεί.');
    }
  };

  const handleGoogleRegister = async () => {
    setError(null);
    if (!supabase) { notConfigured(); return; }

    setLoading(true);
    const next = `/onboarding`;
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}${inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ''}`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    setLoading(false);

    if (oauthError) setError(oauthError.message);
  };

  return (
    <div className="min-h-screen font-sans text-white flex items-center justify-center px-4">
      <div className="fixed inset-0 -z-10">
        <BackgroundGradientAnimation interactive />
        <div className="absolute inset-0 bg-black/50" />
      </div>
      <div className="w-full max-w-md">

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-tight"
            style={{ background: 'linear-gradient(to right, #a78bfa, #fcd34d)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Δημιουργία λογαριασμού
          </h1>

        </div>

        <div className="bg-[#151518] border border-gray-800 rounded-2xl p-8 shadow-2xl">

          {inviteToken && (
            <div className="mb-5">
              <label className="text-xs text-gray-400 mb-1 block">Οργάνισμός</label>
              <div className="w-full px-4 py-3 rounded-full bg-[#0f0f11] border border-gray-800 text-sm text-gray-300 flex items-center gap-2">
                <Building2 size={16} className="text-yellow-400 shrink-0" />
                <span className="truncate">
                  {orgChecking ? 'Έλεγχος πρόσκλησης…' : (orgName ?? 'Μη έγκυρος ή ληγμένος σύνδεσμος πρόσκλησης')}
                </span>
              </div>
              {!orgChecking && !orgName && (
                <p className="text-xs text-red-400 mt-1">Ο σύνδεσμος πρόσκλησης δεν είναι έγκυρος. Επικοινωνήστε με τον διαχειριστή της οργάνωσής σας.</p>
              )}
            </div>
          )}

          <div className="mb-5 flex justify-center">
            <button
              type="button"
              onClick={handleGoogleRegister}
              disabled={loading}
              className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <img src="/dark/web_dark_rd_SU.svg" alt="Εγγραφή με Google" className="h-11" />
            </button>
          </div>

          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#151518] px-2 text-gray-500">ή χρησιμοποιήστε email</span>
            </div>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-full bg-[#0f0f11] border border-gray-800 focus:border-yellow-500/60 outline-none text-sm"
            />
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password (min 8 chars)"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-11 rounded-full bg-[#0f0f11] border border-gray-800 focus:border-yellow-500/60 outline-none text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 cursor-pointer"
                tabIndex={-1}
                aria-label={showPassword ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'}
              >
                {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            {message && <p className="text-sm text-gray-400">{message}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 rounded-full bg-white text-black font-medium text-sm hover:bg-gray-200 transition disabled:opacity-50"
            >
              {loading ? 'Δημιουργία λογαριασμού…' : 'Δημιουργία λογαριασμού'}
            </button>
          </form>

          <p className="text-sm text-gray-500 mt-6 text-center">
            Έχετε ήδη λογαριασμό;{' '}
            <Link href="/auth/login" className="text-yellow-400 hover:text-yellow-300">
              Σύνδεση
            </Link>
          </p>
        </div>

        <div className="flex justify-center mt-4">
          <Link
            href="/"
            className="px-5 py-2 rounded-full bg-white/5 border border-white/10 text-gray-400 text-xs hover:bg-white/10 hover:text-gray-300 transition"
          >
            Επιστροφή στην Αρχική Σελίδα
          </Link>
        </div>
      </div>
    </div>
  );
}
