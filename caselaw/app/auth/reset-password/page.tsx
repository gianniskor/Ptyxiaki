"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation';

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Tracks whether the password was actually updated. The recovery link grants a
  // full session, so if the user leaves without completing the reset we must sign
  // them out to avoid an unintended login.
  const completedRef = useRef(false);

  // The user reaches this page with an active recovery session (created by the
  // /auth/callback route after exchanging the email link's code). Verify it.
  useEffect(() => {
    if (!supabase) {
      setError('Internal configuration error. Please contact support.');
      setChecking(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setError('Ο σύνδεσμος επαναφοράς είναι μη έγκυρος ή έχει λήξει. Ζητήστε νέο σύνδεσμο.');
      }
      setChecking(false);
    });
  }, [supabase]);

  // If the user navigates away or closes the tab without completing the reset,
  // tear down the recovery session so the link does not act as a silent login.
  useEffect(() => {
    if (!supabase) return;
    const handleUnload = () => {
      if (!completedRef.current) {
        supabase.auth.signOut();
      }
    };
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('pagehide', handleUnload);
      if (!completedRef.current) {
        supabase.auth.signOut();
      }
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!supabase) {
      setError('Internal configuration error. Please contact support.');
      return;
    }

    if (password.length < 8) {
      setError('Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Οι κωδικοί δεν ταιριάζουν.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    completedRef.current = true;
    setSuccess(true);
    setTimeout(() => router.replace('/'), 2000);
  };

  return (
    <div className="min-h-screen font-sans text-white flex items-center justify-center px-4">
      <div className="fixed inset-0 -z-10">
        <BackgroundGradientAnimation interactive />
        <div className="absolute inset-0 bg-black/50" />
      </div>
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-tight"
            style={{ background: 'linear-gradient(to right, #a78bfa, #fcd34d)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Νέος κωδικός
          </h1>
        </div>

        <div className="bg-[#151518] border border-gray-800 rounded-2xl p-8 shadow-2xl">

          {checking ? (
            <p className="text-sm text-gray-400 text-center">Έλεγχος συνδέσμου…</p>
          ) : success ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-300">
                Ο κωδικός σας ενημερώθηκε με επιτυχία. Ανακατεύθυνση…
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-400 mb-5 text-center">
                Εισάγετε τον νέο σας κωδικό πρόσβασης.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Νέος κωδικός (τουλάχιστον 8 χαρακτήρες)"
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
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Επιβεβαίωση κωδικού (τουλάχιστον 8 χαρακτήρες)"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-full bg-[#0f0f11] border border-gray-800 focus:border-yellow-500/60 outline-none text-sm"
                />
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-full bg-white text-black font-medium text-sm hover:bg-gray-200 transition disabled:opacity-50"
                >
                  {loading ? 'Ενημέρωση…' : 'Ενημέρωση κωδικού'}
                </button>
              </form>

              {error && (
                <p className="text-sm text-gray-500 mt-6 text-center">
                  <Link href="/auth/forgot-password" className="text-yellow-400 hover:text-yellow-300">
                    Ζητήστε νέο σύνδεσμο επαναφοράς
                  </Link>
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-center mt-4">
          <Link
            href="/auth/login"
            className="px-5 py-2 rounded-full bg-white/5 border border-white/10 text-gray-400 text-xs hover:bg-white/10 hover:text-gray-300 transition"
          >
            Επιστροφή στη Σύνδεση
          </Link>
        </div>
      </div>
    </div>
  );
}
