'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Camera, Loader2, BookOpen, MessageSquare, FileText, Scale } from 'lucide-react'
import { AuthButton } from '@/components/AuthButton'
import { AdminNavLink } from '@/components/AdminNavLink'
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation'

type Claims = { sub: string; email?: string; [key: string]: unknown }

const PLACEHOLDER_BOOKMARKS = [
  { id: 1, title: 'ΑΠ 1234/2023', category: 'Ποινικό', date: '12 Μαρ 2024' },
  { id: 2, title: 'ΕφΑθ 456/2022', category: 'Αστικό', date: '5 Ιαν 2024' },
  { id: 3, title: 'ΣτΕ 789/2023', category: 'Διοικητικό', date: '28 Φεβ 2024' },
  { id: 4, title: 'ΑΠ 321/2024', category: 'Ποινικό', date: '1 Απρ 2024' },
]

const PLACEHOLDER_CONVERSATIONS = [
  { id: 1, title: 'Ανάλυση ΑΠ 1234/2023 σχετικά με αποζημίωση', date: '2 ώρες πριν', messages: 8 },
  { id: 2, title: 'Σύγκριση νομολογίας για αδικοπραξία', date: 'Χθες', messages: 14 },
  { id: 3, title: 'Ερμηνεία άρθρου 932 ΑΚ', date: '3 μέρες πριν', messages: 5 },
  { id: 4, title: 'Αναζήτηση αποφάσεων για συμβατική ευθύνη', date: '1 εβδομάδα πριν', messages: 22 },
  { id: 5, title: 'Ανάλυση νομολογίας ΣτΕ για δημόσιες συμβάσεις', date: '2 εβδομάδες πριν', messages: 11 },
]

export default function AccountForm({ claims }: { claims: Claims | null }) {
  const supabase = createSupabaseBrowserClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  const getProfile = useCallback(async () => {
    if (!claims?.sub || !supabase) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, phone, avatar_url')
      .eq('id', claims.sub)
      .single()
    if (data) {
      setFirstName(data.first_name ?? '')
      setLastName(data.last_name ?? '')
      setPhone(data.phone ?? '')
      setAvatarUrl(data.avatar_url ?? null)
      setAvatarPreview(data.avatar_url ?? null)
    }
    setLoading(false)
  }, [claims, supabase])

  useEffect(() => { getProfile() }, [getProfile])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !supabase || !claims?.sub) return
    setAvatarPreview(URL.createObjectURL(file))
    setUploading(true)
    setError(null)
    const fileExt = file.name.split('.').pop()
    const filePath = `${claims.sub}/avatar.${fileExt}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true })
    if (uploadError) { setError(`Avatar upload failed: ${uploadError.message}`); setAvatarPreview(avatarUrl); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
    setAvatarUrl(urlData.publicUrl)
    setUploading(false)
  }

  const handleSave = async () => {
    if (!supabase || !claims?.sub) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    const first = firstName.trim()
    const last = lastName.trim()
    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: claims.sub,
      first_name: first || null,
      last_name: last || null,
      username: [first, last].filter(Boolean).join(' ') || null,
      phone: phone.trim() || null,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (upsertError) { setError(upsertError.message); return }
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  const initials = ((firstName[0] ?? '') + (lastName[0] ?? '')).toUpperCase() || (claims?.email?.[0]?.toUpperCase() ?? '?')

  const router = useRouter()

  return (
    <div className="min-h-screen text-white">
      {/* Fixed animated background */}
      <div className="fixed inset-0 -z-10">
        <BackgroundGradientAnimation interactive />
      </div>

      <div className="relative z-10 min-h-screen">

      {/* Navbar — matches home/results */}
      <nav className="relative z-10">
        <div className="flex items-center px-8 py-6 max-w-7xl mx-auto">
          <div className="flex-1 flex items-center gap-3">
            <Scale className="w-8 h-8 text-white" />
            <span className="text-xl font-bold tracking-wider">PLACEHOLDER</span>
          </div>

          <div className="hidden md:flex bg-[#1a1a1c]/80 backdrop-blur-sm border border-gray-800 rounded-full shadow-lg p-1">
            <button onClick={() => router.push('/')} className="px-6 py-2.5 rounded-full text-gray-400 hover:text-white transition text-sm font-medium">Αρχική</button>
            <button onClick={() => router.push('/results')} className="px-6 py-2.5 rounded-full text-gray-400 hover:text-white transition text-sm font-medium">Αρχείο</button>
            <button className="px-6 py-2.5 rounded-full text-gray-400 hover:text-white transition text-sm font-medium">AI Chatbot</button>
            <AdminNavLink />
          </div>

          <div className="flex-1 flex items-center justify-end gap-6">
            <AuthButton />
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">

        {/* Profile row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Avatar + identity card */}
          <div className="bg-[#151518] border border-gray-800 rounded-2xl p-6 flex flex-col items-center text-center gap-4">
            <div className="relative group">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="relative w-24 h-24 rounded-full bg-[#0f0f11] border-2 border-gray-700 hover:border-yellow-500/60 transition flex items-center justify-center overflow-hidden"
              >
                {avatarPreview
                  ? <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  : <span className="text-2xl font-bold text-gray-400">{initials}</span>}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition rounded-full">
                  {uploading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
                </div>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
            <div>
              <p className="font-semibold text-white text-lg leading-tight">
                {[firstName, lastName].filter(Boolean).join(' ') || '—'}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">{claims?.email ?? ''}</p>
            </div>
            <div className="w-full pt-2 border-t border-gray-800 text-left space-y-1">
              <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Stats</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Bookmarks</span>
                <span className="text-gray-300 font-medium">4</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">AI conversations</span>
                <span className="text-gray-300 font-medium">5</span>
              </div>
            </div>
          </div>

          {/* Right: Edit form */}
          <div className="lg:col-span-2 bg-[#151518] border border-gray-800 rounded-2xl p-6 space-y-5">
            <h2 className="text-base font-semibold text-white">Edit profile</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl bg-[#0f0f11] border border-gray-800 focus:border-yellow-500/60 outline-none text-sm transition disabled:opacity-40"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl bg-[#0f0f11] border border-gray-800 focus:border-yellow-500/60 outline-none text-sm transition disabled:opacity-40"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email</label>
              <input
                type="text"
                value={claims?.email ?? ''}
                disabled
                className="w-full px-4 py-3 rounded-xl bg-[#0f0f11] border border-gray-800 text-sm text-gray-500"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Phone <span className="text-gray-600">(optional)</span></label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                placeholder="+30 69X XXX XXXX"
                className="w-full px-4 py-3 rounded-xl bg-[#0f0f11] border border-gray-800 focus:border-yellow-500/60 outline-none text-sm transition disabled:opacity-40"
              />
            </div>

            {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>}
            {success && <p className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">Profile updated.</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || uploading || loading}
                className="px-6 py-2.5 rounded-full bg-white text-black font-medium text-sm hover:bg-gray-100 transition disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>

        {/* Bookmarked PDFs */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-4 h-4 text-yellow-500/70" />
            <h2 className="text-base font-semibold text-white">Bookmarked cases</h2>
            <span className="text-xs text-gray-600 bg-gray-800 rounded-full px-2 py-0.5 ml-1">Coming soon</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {PLACEHOLDER_BOOKMARKS.map((item) => (
              <div
                key={item.id}
                className="bg-[#151518] border border-gray-800 rounded-2xl p-4 flex flex-col gap-3 opacity-50 cursor-not-allowed select-none"
              >
                <FileText className="w-6 h-6 text-yellow-500/60" />
                <div>
                  <p className="text-sm font-medium text-white leading-tight">{item.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.category}</p>
                </div>
                <p className="text-xs text-gray-600 mt-auto">{item.date}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent AI conversations */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-yellow-500/70" />
            <h2 className="text-base font-semibold text-white">Recent AI conversations</h2>
            <span className="text-xs text-gray-600 bg-gray-800 rounded-full px-2 py-0.5 ml-1">Coming soon</span>
          </div>
          <div className="bg-[#151518] border border-gray-800 rounded-2xl divide-y divide-gray-800 opacity-50 cursor-not-allowed select-none">
            {PLACEHOLDER_CONVERSATIONS.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <MessageSquare className="w-4 h-4 text-gray-600 shrink-0" />
                  <p className="text-sm text-gray-300 truncate">{item.title}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <span className="text-xs text-gray-600">{item.messages} messages</span>
                  <span className="text-xs text-gray-600">{item.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
      </div>
    </div>
  )
}
