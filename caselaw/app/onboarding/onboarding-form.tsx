'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Camera, Loader2, Building2 } from 'lucide-react'

type Claims = { sub: string; email?: string; [key: string]: unknown }

interface InitialData {
  firstName?: string
  lastName?: string
  avatarUrl?: string | null
}

export default function OnboardingForm({
  claims,
  initialData = {},
  organisationName = null,
}: {
  claims: Claims
  initialData?: InitialData
  organisationName?: string | null
}) {
  const supabase = createSupabaseBrowserClient()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [firstName, setFirstName] = useState(initialData.firstName ?? '')
  const [lastName, setLastName] = useState(initialData.lastName ?? '')
  const [phone, setPhone] = useState('')
  // avatarUrl = the URL we'll save to the DB (may be Google URL or uploaded URL)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialData.avatarUrl ?? null)
  // avatarPreview = what the <img> shows (local blob URL or remote URL)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialData.avatarUrl ?? null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAvatarClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !supabase) return

    // Local preview immediately
    setAvatarPreview(URL.createObjectURL(file))
    setUploading(true)
    setError(null)

    const fileExt = file.name.split('.').pop()
    const filePath = `${claims.sub}/avatar.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      setError(`Avatar upload failed: ${uploadError.message}`)
      setAvatarPreview(null)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
    setAvatarUrl(urlData.publicUrl)
    setUploading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setError(null)
    setSaving(true)

    const first = firstName.trim()
    const last = lastName.trim()
    const username = [first, last].filter(Boolean).join(' ') || null

    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: claims.sub,
      first_name: first || null,
      last_name: last || null,
      username,
      phone: phone.trim() || null,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })

    setSaving(false)
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    router.push('/')
  }

  const initials =
    (firstName[0] ?? '') + (lastName[0] ?? '') ||
    (claims.email?.[0] ?? '?')

  return (
    <div className="w-full max-w-md mx-auto">

      {/* Heading */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-black tracking-tight text-white">
          Το προφίλ σας
        </h1>
        <p className="text-white/60 mt-2 text-sm">Μπορείτε να το ενημερώσετε οποιαδήποτε στιγμή από τον λογαριασμό σας.</p>
      </div>

      <div className="bg-[#151518]/80 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 shadow-2xl">

        {/* Avatar picker */}
        <div className="flex flex-col items-center mb-7">
          <button
            type="button"
            onClick={handleAvatarClick}
            disabled={uploading}
            className="relative group w-20 h-20 rounded-full bg-[#0f0f11] border-2 border-gray-700 hover:border-yellow-500/60 transition flex items-center justify-center overflow-hidden"
          >
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xl font-bold text-gray-400 uppercase select-none">
                {initials}
              </span>
            )}
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition rounded-full">
              {uploading
                ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                : <Camera className="w-5 h-5 text-white" />}
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <p className="text-xs text-gray-500 mt-2">Κάντε κλικ για να προσθέσετε μια φωτογραφία (προαιρετικό)</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block" htmlFor="firstName">
                Όνομα
              </label>
              <input
                id="firstName"
                type="text"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#0f0f11] border border-gray-800 focus:border-yellow-500/60 outline-none text-sm transition"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block" htmlFor="lastName">
                Επώνυμο
              </label>
              <input
                id="lastName"
                type="text"
                placeholder="Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#0f0f11] border border-gray-800 focus:border-yellow-500/60 outline-none text-sm transition"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block" htmlFor="phone">
              Αριθμός τηλεφώνου
              <span className="text-gray-600 ml-1">(προαιρετικό)</span>
            </label>
            <input
              id="phone"
              type="tel"
              placeholder="+30 69X XXX XXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[#0f0f11] border border-gray-800 focus:border-yellow-500/60 outline-none text-sm transition"
            />

          </div>

          {organisationName && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Οργάνισμός</label>
              <div className="w-full px-4 py-3 rounded-xl bg-[#0f0f11] border border-gray-800 text-sm text-gray-400 flex items-center gap-2">
                <Building2 size={16} className="text-yellow-400 shrink-0" />
                <span className="truncate">{organisationName}</span>
              </div>
              <p className="text-[11px] text-gray-600 mt-1">Ορίζεται από τον διαχειριστή της οργάνωσής σας και δεν μπορεί να αλλάξει.</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || uploading}
            className="w-full px-4 py-3 rounded-full bg-white text-black font-medium text-sm hover:bg-gray-100 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Αποθήκευση…' : 'Ολοκλήρωση ρύθμισης προφίλ'}
          </button>
        </form>


      </div>
    </div>
  )
}
