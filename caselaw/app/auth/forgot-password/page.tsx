"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation';

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!supabase) {
      setError('Internal configuration error. Please contact support.');
      return;
    }

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    });
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setSent(true);
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
            Επαναφορά κωδικού
          </h1>
        </div>

        <div className="bg-[#151518] border border-gray-800 rounded-2xl p-8 shadow-2xl">

          {sent ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-300">
                Αν υπάρχει λογαριασμός με αυτό το email, σας στείλαμε έναν σύνδεσμο για την επαναφορά
                του κωδικού σας. Ελέγξτε τα εισερχόμενά σας.
              </p>
              <Link
                href="/auth/login"
                className="inline-block w-full px-4 py-3 rounded-full bg-white text-black font-medium text-sm hover:bg-gray-200 transition"
              >
                Επιστροφή στη Σύνδεση
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-400 mb-5 text-center">
                Εισάγετε το email σας και θα σας στείλουμε έναν σύνδεσμο για να επαναφέρετε τον κωδικό σας.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="email"
                  placeholder="Email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-full bg-[#0f0f11] border border-gray-800 focus:border-yellow-500/60 outline-none text-sm"
                />
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-full bg-white text-black font-medium text-sm hover:bg-gray-200 transition disabled:opacity-50"
                >
                  {loading ? 'Αποστολή…' : 'Αποστολή συνδέσμου'}
                </button>
              </form>

              <p className="text-sm text-gray-500 mt-6 text-center">
                Θυμηθήκατε τον κωδικό σας;{' '}
                <Link href="/auth/login" className="text-yellow-400 hover:text-yellow-300">
                  Σύνδεση
                </Link>
              </p>
            </>
          )}
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
