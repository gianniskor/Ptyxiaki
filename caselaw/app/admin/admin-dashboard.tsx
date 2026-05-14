'use client'

import { useRef, useState, useMemo } from 'react'
import { Tabs } from '@heroui/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Scale, Shield, Users, Upload, Building2,
  FileSearch, Trash2, Pencil, Plus, X, Check,
  Loader2, ChevronDown, ChevronsUpDown, Eye,
} from 'lucide-react'
import { AuthButton } from '@/components/AuthButton'
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

const BACKEND = 'http://localhost:8000'

const CATEGORIES = ['Διοικητικό', 'Αστικό', 'Ποινικό', 'Εμπορικό', 'Εργατικό', 'Οικογενειακό']

type Profile = {
  id: string
  first_name: string | null
  last_name: string | null
  username: string | null
  role: string | null
  updated_at: string | null
}

type Court = {
  id: string
  abbreviation: string
  full_name: string
  facet_label: string | null
}

type SolrDoc = {
  id: string
  arithmos: string
  titlos: string
  dikastirio: string
  etos: number
  katigoria: string[]
  pdf_path: string
}

type Tab = 'users' | 'upload' | 'courts' | 'pdfs'
//FIXME : the UI for the accounts in general must be changed
//TODO :  make the email show instead of the uuid in the users table, and add a search box to find specific users
interface Props {
  userCount: number
  profiles: Profile[]
  courts: Court[]
}

export default function AdminDashboard({ userCount, profiles, courts: initialCourts }: Props) {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [activeTab, setActiveTab] = useState<Tab>('users')

  // ── Upload state ──────────────────────────────────────────────────────────
  type QueueItem = { file: File; category: string; key: string }
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingCategory, setPendingCategory] = useState(CATEGORIES[0])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [uploadProgress, setUploadProgress] = useState<Record<string, 'pending' | 'ok' | 'error'>>({})
  const [uploading, setUploading] = useState(false)

  const addToQueue = (files: File[]) => {
    const pdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf'))
    const items: QueueItem[] = pdfs.map(f => ({ file: f, category: pendingCategory, key: `${f.name}-${Date.now()}-${Math.random()}` }))
    setQueue(q => [...q, ...items])
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addToQueue(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    addToQueue(Array.from(e.dataTransfer.files))
  }

  const removeFromQueue = (key: string) => {
    setQueue(q => q.filter(item => item.key !== key))
    setUploadProgress(p => { const n = { ...p }; delete n[key]; return n })
  }

  const uploadAll = async () => {
    setUploading(true)
    for (const item of queue) {
      if (uploadProgress[item.key] === 'ok') continue
      setUploadProgress(p => ({ ...p, [item.key]: 'pending' }))
      const fd = new FormData()
      fd.append('file', item.file)
      try {
        const res = await fetch(`${BACKEND}/api/index?katigoria=${encodeURIComponent(item.category)}`, {
          method: 'POST',
          body: fd,
        })
        const data = await res.json()
        setUploadProgress(p => ({ ...p, [item.key]: data.status === 'ok' ? 'ok' : 'error' }))
      } catch {
        setUploadProgress(p => ({ ...p, [item.key]: 'error' }))
      }
    }
    setUploading(false)
  }

  // Courts state
  const [courts, setCourts] = useState<Court[]>(initialCourts)
  const [newCourt, setNewCourt] = useState({ abbreviation: '', full_name: '', facet_label: '' })
  const [courtSaving, setCourtSaving] = useState(false)
  const [courtError, setCourtError] = useState<string | null>(null)
  const [editingCourt, setEditingCourt] = useState<Court | null>(null)

  const addCourt = async () => {
    if (!newCourt.abbreviation || !newCourt.full_name) return
    setCourtSaving(true); setCourtError(null)
    try {
      const res = await fetch(`${BACKEND}/api/courts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newCourt, facet_label: newCourt.facet_label || newCourt.full_name }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCourts(c => [...c, data])
      setNewCourt({ abbreviation: '', full_name: '', facet_label: '' })
    } catch (e: unknown) {
      setCourtError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setCourtSaving(false)
    }
  }

  const deleteCourt = async (id: string) => {
    await fetch(`${BACKEND}/api/courts/${id}`, { method: 'DELETE' })
    setCourts(c => c.filter(x => x.id !== id))
  }

  const saveEditCourt = async () => {
    if (!editingCourt) return
    setCourtSaving(true)
    try {
      const res = await fetch(`${BACKEND}/api/courts/${editingCourt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abbreviation: editingCourt.abbreviation, full_name: editingCourt.full_name, facet_label: editingCourt.facet_label }),
      })
      if (!res.ok) throw new Error(await res.text())
      setCourts(c => c.map(x => x.id === editingCourt.id ? editingCourt : x))
      setEditingCourt(null)
    } finally {
      setCourtSaving(false)
    }
  }

  // PDF search state
  const [pdfQuery, setPdfQuery] = useState('')
  const [pdfResults, setPdfResults] = useState<SolrDoc[]>([])
  const [pdfSearching, setPdfSearching] = useState(false)
  const [editingDoc, setEditingDoc] = useState<SolrDoc | null>(null)
  const [docSaving, setDocSaving] = useState(false)
  const [docError, setDocError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const searchPdfs = async () => {
    if (!pdfQuery.trim()) return
    setPdfSearching(true)
    try {
      const res = await fetch(`${BACKEND}/api/search?q=${encodeURIComponent(pdfQuery)}&rows=20`)
      const data = await res.json()
      setPdfResults(data.results ?? [])
    } finally {
      setPdfSearching(false)
    }
  }

  const saveDoc = async () => {
    if (!editingDoc) return
    setDocSaving(true); setDocError(null)
    try {
      const res = await fetch(`${BACKEND}/api/cases/${editingDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titlos: editingDoc.titlos,
          dikastirio: editingDoc.dikastirio,
          etos: editingDoc.etos,
          katigoria: editingDoc.katigoria,
          arithmos: editingDoc.arithmos,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setPdfResults(r => r.map(d => d.id === editingDoc.id ? editingDoc : d))
      setEditingDoc(null)
    } catch (e: unknown) {
      setDocError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setDocSaving(false)
    }
  }

  const deleteDoc = async (id: string) => {
    await fetch(`${BACKEND}/api/cases/${id}`, { method: 'DELETE' })
    setPdfResults(r => r.filter(d => d.id !== id))
    setDeleteConfirm(null)
  }

  // ── Sort / chip helpers ──────────────────────────────────────────────────
  type SortConfig = { col: string; dir: 'asc' | 'desc' }
  const [userSort, setUserSort]   = useState<SortConfig>({ col: 'first_name', dir: 'asc' })
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [courtSort, setCourtSort] = useState<SortConfig>({ col: 'abbreviation', dir: 'asc' })
  const [pdfSort,   setPdfSort]   = useState<SortConfig>({ col: 'arithmos',    dir: 'asc' })

  const sortedProfiles = useMemo(() => [...profiles].sort((a, b) => {
    const av = String(a[userSort.col as keyof Profile] ?? '')
    const bv = String(b[userSort.col as keyof Profile] ?? '')
    return (userSort.dir === 'asc' ? 1 : -1) * av.localeCompare(bv, 'el')
  }), [profiles, userSort])

  const sortedCourts = useMemo(() => [...courts].sort((a, b) => {
    const av = String(a[courtSort.col as keyof Court] ?? '')
    const bv = String(b[courtSort.col as keyof Court] ?? '')
    return (courtSort.dir === 'asc' ? 1 : -1) * av.localeCompare(bv, 'el')
  }), [courts, courtSort])

  const sortedPdfResults = useMemo(() => [...pdfResults].sort((a, b) => {
    const col = pdfSort.col as keyof SolrDoc
    let av: string | number, bv: string | number
    if (col === 'etos')      { av = a.etos ?? 0;                    bv = b.etos ?? 0 }
    else if (col === 'katigoria') { av = a.katigoria?.join('') ?? ''; bv = b.katigoria?.join('') ?? '' }
    else                     { av = String(a[col] ?? '');           bv = String(b[col] ?? '') }
    const cmp = typeof av === 'number' ? av - (bv as number) : (av as string).localeCompare(bv as string, 'el')
    return pdfSort.dir === 'asc' ? cmp : -cmp
  }), [pdfResults, pdfSort])

  const toggleUserSort  = (col: string) => setUserSort(s  => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
  const toggleCourtSort = (col: string) => setCourtSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
  const togglePdfSort   = (col: string) => setPdfSort(s   => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })

  const sortHeader = (col: string, sort: SortConfig, toggle: (c: string) => void, label: string, className = '') => (
    <th
      className={`px-6 py-3 text-left font-medium cursor-pointer select-none hover:text-gray-300 transition ${className}`}
      onClick={() => toggle(col)}
    >
      <span className="flex items-center gap-1.5">
        {label}
        {sort.col === col
          ? <ChevronDown className={`w-3 h-3 transition-transform ${sort.dir === 'desc' ? '' : 'rotate-180'}`} />
          : <ChevronsUpDown className="w-3 h-3 opacity-30" />}
      </span>
    </th>
  )

  const avatarBg = (name: string) => {
    const cs = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-rose-500', 'bg-amber-500', 'bg-cyan-600']
    return cs[name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % cs.length]
  }
  const getInitials = (first: string | null, last: string | null, username: string | null) =>
    [first?.[0], last?.[0]].filter(Boolean).join('').toUpperCase() || username?.[0]?.toUpperCase() || '?'

  const roleChipClass = (role: string | null) =>
    role === 'admin'
      ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
      : 'bg-white/5 text-gray-500 border-gray-700'

  const categoryChipClass = (cat: string) => {
    const map: Record<string, string> = {
      'Διοικητικό':   'bg-blue-500/15 text-blue-400 border-blue-500/30',
      'Αστικό':       'bg-violet-500/15 text-violet-400 border-violet-500/30',
      'Ποινικό':      'bg-red-500/15 text-red-400 border-red-500/30',
      'Εμπορικό':     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      'Εργατικό':     'bg-orange-500/15 text-orange-400 border-orange-500/30',
      'Οικογενειακό': 'bg-pink-500/15 text-pink-400 border-pink-500/30',
    }
    return map[cat] ?? 'bg-white/5 text-gray-400 border-gray-700'
  }

  // Render
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'users',  label: 'Users',          icon: <Users className="w-4 h-4" /> },
    { key: 'upload', label: 'Upload Dataset',  icon: <Upload className="w-4 h-4" /> },
    { key: 'courts', label: 'Court Names',     icon: <Building2 className="w-4 h-4" /> },
    { key: 'pdfs',   label: 'Search & Edit',   icon: <FileSearch className="w-4 h-4" /> },
  ]

  return (
    <div className="min-h-screen text-white font-sans selection:bg-yellow-500/30" data-theme="dark">
      <div className="fixed inset-0 -z-10">
        <BackgroundGradientAnimation interactive />
        <div className="absolute inset-0 bg-black/55" />
      </div>

      <div className="relative z-10 min-h-screen">
        {/* Navbar */}
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
              <Link href="/admin" className="px-6 py-2.5 rounded-full bg-yellow-500/15 text-yellow-300 text-sm font-medium flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />Admin
              </Link>
            </div>
            <div className="flex-1 flex items-center justify-end">
              <AuthButton />
            </div>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

          {/* Header + stat cards */}
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-yellow-400" />
            <h1 className="text-2xl font-bold">Admin Panel</h1>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-surface border border-border rounded-2xl p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Users</p>
              <span className="text-3xl font-bold text-white">{userCount}</span>
            </div>
          </div>

          {/* Tabs */}
          <Tabs
            selectedKey={activeTab}
            onSelectionChange={key => setActiveTab(key as Tab)}
            className="w-full"
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="Admin sections">
                {tabs.map(t => (
                  <Tabs.Tab key={t.key} id={t.key}>
                    <span className="flex items-center gap-2">{t.icon}{t.label}</span>
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>

            {/* ── Users Tab ── */}
            <Tabs.Panel id="users">
            <div className="bg-surface border border-border rounded-2xl overflow-hidden mt-4">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">All Users</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted text-xs uppercase tracking-wider">

                      {sortHeader('first_name', userSort, toggleUserSort, 'Member')}
                      {sortHeader('username',   userSort, toggleUserSort, 'Username')}
                      {sortHeader('role',       userSort, toggleUserSort, 'Role')}
                      {sortHeader('updated_at', userSort, toggleUserSort, 'Last Updated')}
                    </tr>
                  </thead>
                  <tbody>
                    { sortedProfiles.map(p => {
                      const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ')
                      const displayName = fullName || p.username || '—'
                      return (
                        <tr key={p.id} className={`border-b border-border/50 hover:bg-white/5 transition ${selectedUsers.has(p.id) ? 'bg-yellow-500/[0.04]' : ''}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 ${avatarBg(displayName)}`}>
                                {getInitials(p.first_name, p.last_name, p.username)}
                              </div>
                              <div>
                                <p className="text-gray-200">{displayName}</p>
                                <p className="text-gray-600 text-xs font-mo no">{p.id.slice(0, 8)}…</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-400">{p.username ?? '—'}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${roleChipClass(p.role)}`}>
                              {p.role ?? 'user'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-500 text-xs">
                            {p.updated_at ? new Date(p.updated_at).toLocaleDateString('el-GR') : '—'}
                          </td>
                        </tr>
                      )
                    })}
                    {profiles.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-600 text-sm">No users found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            </Tabs.Panel>

            {/* ── Upload Tab ── */}
            <Tabs.Panel id="upload">
            <div className="mt-4">
            <div className="space-y-6">
              <div className="bg-surface border border-border rounded-2xl p-6 space-y-5">
                <h2 className="text-sm font-semibold text-white">Dataset Upload</h2>

                {/* Category row */}
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <select
                      value={pendingCategory}
                      onChange={e => setPendingCategory(e.target.value)}
                      className="appearance-none bg-background border border-border text-foreground text-sm rounded-xl px-4 py-2.5 pr-10 focus:border-yellow-500/60 outline-none"
                    >
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                  <span className="text-xs text-gray-600">Select category, then click or drop files.
                  </span>
                </div>

                {/* Drop zone — click to pick files, drop files or folders */}
                <div
                  onDrop={handleDrop}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-700 hover:border-yellow-500/50 rounded-2xl p-12 flex flex-col items-center justify-center gap-3 cursor-pointer transition"
                >
                  <Upload className="w-10 h-10 text-gray-600" />
                  <p className="text-gray-400 text-sm">Drop files here, or <span className="text-yellow-400">click to browse</span></p>
                  <p className="text-gray-600 text-xs">only .pdf files will be added</p>
                  <input ref={fileInputRef} type="file" multiple accept=".pdf" className="hidden" onChange={handleFileSelect} />
                </div>

                {/* Queue */}
                {queue.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">{queue.length} file{queue.length !== 1 ? 's' : ''} in queue</span>
                      <div className="flex items-center gap-2">
                        {queue.some(i => uploadProgress[i.key] === 'ok') && (
                          <button
                            onClick={() => setQueue(q => q.filter(i => uploadProgress[i.key] !== 'ok'))}
                            className="text-xs text-gray-500 hover:text-gray-300 transition px-3 py-1.5 rounded-lg hover:bg-white/5"
                          >
                            Clear done
                          </button>
                        )}
                        <button
                          onClick={uploadAll}
                          disabled={uploading || queue.length === 0}
                          className="flex items-center gap-2 px-5 py-2 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-sm hover:bg-yellow-500/25 transition disabled:opacity-50"
                        >
                          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                          {uploading ? 'Uploading…' : 'Upload All'}
                        </button>
                      </div>
                    </div>

                    <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                      {queue.map(item => {
                        const status = uploadProgress[item.key]
                        return (
                          <div key={item.key} className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-2.5">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-gray-700 text-gray-400 shrink-0">{item.category}</span>
                            <span className="text-sm text-gray-300 truncate flex-1">{item.file.name}</span>
                            {status === 'pending' && <Loader2 className="w-4 h-4 text-gray-500 animate-spin shrink-0" />}
                            {status === 'ok'      && <Check className="w-4 h-4 text-green-400 shrink-0" />}
                            {status === 'error'   && <X className="w-4 h-4 text-red-400 shrink-0" />}
                            {!status && (
                              <button onClick={() => removeFromQueue(item.key)} className="p-1 rounded-lg hover:bg-white/5 text-gray-600 hover:text-gray-400 transition shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
            </Tabs.Panel>
            {/* ── Courts Tab ── */}
            <Tabs.Panel id="courts">
            <div className="mt-4">
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Court Names & Abbreviations</h2>
                {courtError && <p className="text-xs text-red-400">{courtError}</p>}
              </div>

              {/* Add new row */}
              <div className="px-6 py-4 border-b border-border bg-white/[0.02]">
                <div className="flex gap-3 items-end flex-wrap">
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Abbreviation</label>
                    <input
                      placeholder="ΑΠ"
                      value={newCourt.abbreviation}
                      onChange={e => setNewCourt(n => ({ ...n, abbreviation: e.target.value }))}
                      className="w-28 px-3 py-2 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Full Name</label>
                    <input
                      placeholder="Άρειος Πάγος"
                      value={newCourt.full_name}
                      onChange={e => setNewCourt(n => ({ ...n, full_name: e.target.value }))}
                      className="w-64 px-3 py-2 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Facet Label <span className="text-gray-600">(optional)</span></label>
                    <input
                      placeholder="Same as full name if empty"
                      value={newCourt.facet_label}
                      onChange={e => setNewCourt(n => ({ ...n, facet_label: e.target.value }))}
                      className="w-56 px-3 py-2 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm"
                    />
                  </div>
                  <button
                    onClick={addCourt}
                    disabled={courtSaving || !newCourt.abbreviation || !newCourt.full_name}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-gray-700 text-gray-300 text-sm hover:bg-white/10 transition disabled:opacity-40"
                  >
                    {courtSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted text-xs uppercase tracking-wider">
                      {sortHeader('abbreviation', courtSort, toggleCourtSort, 'Abbreviation')}
                      {sortHeader('full_name',    courtSort, toggleCourtSort, 'Full Name')}
                      {sortHeader('facet_label',  courtSort, toggleCourtSort, 'Facet Label')}
                      <th className="px-6 py-3 text-left font-medium w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCourts.map(c => (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-white/5 transition">
                      {editingCourt?.id === c.id ? (
                        <>
                          <td className="px-4 py-3">
                            <input value={editingCourt.abbreviation} onChange={e => setEditingCourt(x => x && ({ ...x, abbreviation: e.target.value }))}
                              className="w-24 px-3 py-1.5 rounded-lg bg-background border border-border focus:border-yellow-500/60 outline-none text-sm" />
                          </td>
                          <td className="px-4 py-3">
                            <input value={editingCourt.full_name} onChange={e => setEditingCourt(x => x && ({ ...x, full_name: e.target.value }))}
                              className="w-64 px-3 py-1.5 rounded-lg bg-background border border-border focus:border-yellow-500/60 outline-none text-sm" />
                          </td>
                          <td className="px-4 py-3">
                            <input value={editingCourt.facet_label ?? ''} onChange={e => setEditingCourt(x => x && ({ ...x, facet_label: e.target.value }))}
                              className="w-48 px-3 py-1.5 rounded-lg bg-background border border-border focus:border-yellow-500/60 outline-none text-sm" />
                          </td>
                          <td className="px-4 py-3 flex gap-2">
                            <button onClick={saveEditCourt} disabled={courtSaving} className="p-1.5 rounded-lg hover:bg-green-500/10 text-green-400 transition">
                              {courtSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setEditingCourt(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 transition">
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 text-gray-200 font-mono">{c.abbreviation}</td>
                          <td className="px-6 py-4 text-gray-300">{c.full_name}</td>
                          <td className="px-6 py-4 text-gray-500">{c.facet_label ?? c.full_name}</td>
                          <td className="px-6 py-4 flex gap-2">
                            <button onClick={() => setEditingCourt(c)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteCourt(c.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                    {courts.length === 0 && (
                      <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-600 text-sm">No courts added yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            </div>
            </Tabs.Panel>
            {/* ── PDF Search & Edit Tab ── */}
            <Tabs.Panel id="pdfs">
            <div className="mt-4">
            <div className="space-y-6">
              {/* Search bar */}
              <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-semibold text-white">Search & Edit Indexed PDFs</h2>
                <div className="flex gap-3">
                  <input
                    value={pdfQuery}
                    onChange={e => setPdfQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchPdfs()}
                    placeholder="Search by title, case number, court…"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm"
                  />
                  <button
                    onClick={searchPdfs}
                    disabled={pdfSearching}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-gray-700 text-gray-300 text-sm hover:bg-white/10 transition disabled:opacity-50"
                  >
                    {pdfSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />}
                    Search
                  </button>
                </div>
              </div>

              {/* Results */}
              {pdfResults.length > 0 && (
                <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-muted text-xs uppercase tracking-wider">
                          {sortHeader('arithmos',    pdfSort, togglePdfSort, 'Case No.')}
                          {sortHeader('dikastirio',  pdfSort, togglePdfSort, 'Court')}
                          {sortHeader('etos',        pdfSort, togglePdfSort, 'Year')}
                          {sortHeader('katigoria',   pdfSort, togglePdfSort, 'Category')}
                          <th className="px-6 py-3 text-right font-medium w-32">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedPdfResults.map(doc => (
                          <tr key={doc.id} className="border-b border-border/50 hover:bg-white/5 transition">
                            <td className="px-6 py-4">
                              <p className="text-gray-200 font-mono text-xs">{doc.arithmos}</p>
                              <p className="text-gray-500 text-xs truncate max-w-[200px]">{doc.titlos}</p>
                            </td>
                            <td className="px-6 py-4 text-gray-400 text-xs">{doc.dikastirio}</td>
                            <td className="px-6 py-4 text-gray-400 text-xs">{doc.etos || '—'}</td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1">
                                {(doc.katigoria ?? []).map(cat => (
                                  <span key={cat} className={`px-2 py-0.5 rounded-full text-xs font-medium border ${categoryChipClass(cat)}`}>{cat}</span>
                                ))}
                                {!doc.katigoria?.length && <span className="text-gray-600 text-xs">—</span>}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-1">
                                <a
                                  href={`${BACKEND}/pdf/${encodeURIComponent(doc.katigoria?.[0] ?? '')}/${doc.pdf_path}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition"
                                >
                                  <Eye className="w-4 h-4" />
                                </a>
                                <button onClick={() => { setEditingDoc(doc); setDocError(null) }} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                {deleteConfirm === doc.id ? (
                                  <>
                                    <button onClick={() => deleteDoc(doc.id)} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition">
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setDeleteConfirm(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 transition">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <button onClick={() => setDeleteConfirm(doc.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            </div>
            </Tabs.Panel>
          </Tabs>
        </div>
      </div>

      {/* Edit PDF Modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setEditingDoc(null)} />
          <div className="relative bg-surface border border-border rounded-2xl p-6 w-full max-w-lg space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Edit Document</h3>
              <button onClick={() => setEditingDoc(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 transition"><X className="w-4 h-4" /></button>
            </div>

            {docError && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{docError}</p>}

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Case Number (arithmos)</label>
                <input value={editingDoc.arithmos} onChange={e => setEditingDoc(d => d && ({ ...d, arithmos: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Title</label>
                <textarea value={editingDoc.titlos} onChange={e => setEditingDoc(d => d && ({ ...d, titlos: e.target.value }))} rows={3}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Court (dikastirio)</label>
                  <input value={editingDoc.dikastirio} onChange={e => setEditingDoc(d => d && ({ ...d, dikastirio: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Year</label>
                  <input type="number" value={editingDoc.etos} onChange={e => setEditingDoc(d => d && ({ ...d, etos: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Category</label>
                <div className="relative">
                  <select
                    value={editingDoc.katigoria?.[0] ?? ''}
                    onChange={e => setEditingDoc(d => d && ({ ...d, katigoria: [e.target.value] }))}
                    className="w-full appearance-none px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm pr-10"
                  >
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditingDoc(null)} className="px-5 py-2 rounded-full bg-white/5 border border-border text-muted text-sm hover:bg-white/10 transition">
                Cancel
              </button>
              <button onClick={saveDoc} disabled={docSaving} className="flex items-center gap-2 px-5 py-2 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-sm hover:bg-yellow-500/25 transition disabled:opacity-50">
                {docSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
