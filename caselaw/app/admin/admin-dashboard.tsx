'use client'

import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import type { SortDescriptor } from '@heroui/react'
import { Tabs, Chip, Table, Surface } from '@heroui/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Scale, Shield, Users, Upload, Building2,
  FileSearch, Trash2, Pencil, Plus, X, Check,
  Loader2, ChevronDown, Eye, Clock,
  UserCheck, UserX, Copy, Link2, RefreshCw,
} from 'lucide-react'
import { AuthButton } from '@/components/AuthButton'
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { fetchHierarchy, fetchGlobalFacets } from '@/lib/api'

const BACKEND = 'http://localhost:8000'

const OTHER = '__other__'
const UNCATEGORIZED = 'Αταξινόμητο'

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, 'el', { numeric: true, sensitivity: 'base' })

type Profile = {
  id: string
  first_name: string | null
  last_name: string | null
  username: string | null
  email: string | null
  role: string | null
  org_role: string | null
  updated_at: string | null
  status: string
  organisation_id: string | null
  organisation_name: string | null
}

type Organisation = {
  id: string
  name: string
}

type SolrDoc = {
  id: string
  arithmos: string
  titlos: string
  dikastirio: string
  etos: number
  katigoria: string[]
  ypokatigoria?: string[]
  organismos?: string[]
  pdf_path: string
}

type Tab = 'users' | 'orgs' | 'upload' | 'pdfs'
interface Props {
  userCount: number
  profiles: Profile[]
  organisations: Organisation[]
}

export default function AdminDashboard({ userCount, profiles, organisations: initialOrgs }: Props) {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()!
  const [activeTab, setActiveTab] = useState<Tab>('users')

  // ── Category hierarchy (loaded from the indexed corpus) ────────────────────
  const [hierarchy, setHierarchy] = useState<Record<string, string[]>>({})
  const [orgOptions, setOrgOptions] = useState<string[]>([])
  useEffect(() => {
    fetchHierarchy().then(setHierarchy).catch(() => {})
    fetchGlobalFacets().then(f => setOrgOptions(f.organismos.map(o => o.value))).catch(() => {})
  }, [])
  const categoryOptions = useMemo(() => {
    // Show every indexed category
    const keys = Object.keys(hierarchy)
    const base = (keys.length ? keys : []).sort(naturalCompare)
    return [...base, UNCATEGORIZED]
  }, [hierarchy])

  // ── Upload state ──────────────────────────────────────────────────────────
  type QueueItem = { file: File; category: string; subcategory: string; key: string }
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingCategory, setPendingCategory] = useState('')
  const [pendingCategoryOther, setPendingCategoryOther] = useState('')
  const [pendingSubcategory, setPendingSubcategory] = useState('')
  const [pendingSubcategoryOther, setPendingSubcategoryOther] = useState('')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [uploadProgress, setUploadProgress] = useState<Record<string, 'pending' | 'ok' | 'error'>>({})
  const [uploading, setUploading] = useState(false)

  // Default the category to the first available option once the hierarchy loads.
  useEffect(() => {
    if (!pendingCategory && categoryOptions.length) setPendingCategory(categoryOptions[0])
  }, [categoryOptions, pendingCategory])

  const effectiveCategory = (pendingCategory === OTHER ? pendingCategoryOther : pendingCategory).trim()
  const subcategoryOptions = pendingCategory === OTHER ? [] : (hierarchy[pendingCategory] ?? [])
  const effectiveSubcategory = (pendingSubcategory === OTHER ? pendingSubcategoryOther : pendingSubcategory).trim()

  const addToQueue = (files: File[]) => {
    if (!effectiveCategory) return
    const pdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf'))
    const items: QueueItem[] = pdfs.map(f => ({
      file: f,
      category: effectiveCategory,
      subcategory: effectiveSubcategory,
      key: `${f.name}-${Date.now()}-${Math.random()}`,
    }))
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
      const params = new URLSearchParams({ katigoria: item.category })
      if (item.subcategory) params.append('ypokatigoria', item.subcategory)
      try {
        const res = await fetch(`${BACKEND}/api/index?${params.toString()}`, {
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


  // ── Users (approval) state ────────────────────────────────────────────────
  const [profileList, setProfileList] = useState<Profile[]>(profiles)
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null)
  const [refreshingUsers, setRefreshingUsers] = useState(false)

  // Keep local state in sync with fresh server data after a router.refresh().
  useEffect(() => {
    setProfileList(profiles)
    setRefreshingUsers(false)
  }, [profiles])

  const refreshUsers = () => {
    setRefreshingUsers(true)
    router.refresh()
  }

  // Copy-to-clipboard feedback: which (id, field) was just copied.
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const copyToClipboard = async (value: string | null, key: string) => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopiedField(key)
    setTimeout(() => setCopiedField(c => c === key ? null : c), 1500)
  }

  const updateUserStatus = async (id: string, status: 'approved' | 'rejected' | 'pending') => {
    setStatusUpdating(id)
    const { error } = await supabase.from('profiles').update({ status }).eq('id', id)
    setStatusUpdating(null)
    if (!error) {
      setProfileList(list => list.map(p => p.id === id ? { ...p, status } : p))
    }
  }

  // ── Edit / delete a user account ──────────────────────────────────────────
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [editOrgId, setEditOrgId] = useState<string>('')
  const [editOrgRole, setEditOrgRole] = useState<string>('member')
  const [userSaving, setUserSaving] = useState(false)
  const [userError, setUserError] = useState<string | null>(null)
  const [deleteUser, setDeleteUser] = useState<Profile | null>(null)
  const [userDeleting, setUserDeleting] = useState(false)

  const openEditUser = (p: Profile) => {
    setEditingUser(p)
    setEditOrgId(p.organisation_id ?? '')
    setEditOrgRole(p.org_role ?? 'member')
    setUserError(null)
  }

  const saveUser = async () => {
    if (!editingUser) return
    setUserSaving(true); setUserError(null)
    const newOrgId = editOrgId || null
    const newOrgRole = newOrgId ? editOrgRole : null
    const { error } = await supabase
      .from('profiles')
      .update({ organisation_id: newOrgId, org_role: newOrgRole })
      .eq('id', editingUser.id)
    setUserSaving(false)
    if (error) { setUserError(error.message); return }
    const orgName = orgs.find(o => o.id === newOrgId)?.name ?? null
    setProfileList(list => list.map(p => p.id === editingUser.id
      ? { ...p, organisation_id: newOrgId, org_role: newOrgRole, organisation_name: orgName }
      : p))
    setEditingUser(null)
  }

  const confirmDeleteUser = async () => {
    if (!deleteUser) return
    setUserDeleting(true); setUserError(null)
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: deleteUser.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Delete failed')
      }
      setProfileList(list => list.filter(p => p.id !== deleteUser.id))
      setDeleteUser(null)
    } catch (e: unknown) {
      setUserError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setUserDeleting(false)
    }
  }

  // ── Organisations / invites state ─────────────────────────────────────────
  const [orgs, setOrgs] = useState<Organisation[]>(initialOrgs)
  const [newOrgName, setNewOrgName] = useState('')
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgError, setOrgError] = useState<string | null>(null)
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({})
  const [inviteCreating, setInviteCreating] = useState<string | null>(null)
  const [copiedOrg, setCopiedOrg] = useState<string | null>(null)

  const addOrg = async () => {
    const name = newOrgName.trim()
    if (!name) return
    setOrgSaving(true); setOrgError(null)
    const { data, error } = await supabase
      .from('organisations')
      .insert({ name })
      .select('id, name')
      .single()
    setOrgSaving(false)
    if (error) { setOrgError(error.message); return }
    if (data) { setOrgs(o => [...o, data].sort((a, b) => a.name.localeCompare(b.name, 'el'))); setNewOrgName('') }
  }

  const generateInvite = async (orgId: string) => {
    setInviteCreating(orgId); setOrgError(null)
    const { data, error } = await supabase
      .from('invite_tokens')
      .insert({ organisation_id: orgId })
      .select('token')
      .single()
    setInviteCreating(null)
    if (error) { setOrgError(error.message); return }
    if (data) {
      const link = `${window.location.origin}/auth/register?token=${data.token}`
      setInviteLinks(l => ({ ...l, [orgId]: link }))
    }
  }

  const copyInvite = async (orgId: string) => {
    const link = inviteLinks[orgId]
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopiedOrg(orgId)
    setTimeout(() => setCopiedOrg(c => c === orgId ? null : c), 2000)
  }

  // ── Edit / delete an organisation ─────────────────────────────────────────
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null)
  const [editOrgName, setEditOrgName] = useState('')
  const [orgRenaming, setOrgRenaming] = useState(false)
  const [deleteOrg, setDeleteOrg] = useState<Organisation | null>(null)
  const [orgDeleting, setOrgDeleting] = useState(false)

  const startEditOrg = (org: Organisation) => {
    setEditingOrgId(org.id)
    setEditOrgName(org.name)
    setOrgError(null)
  }

  const saveOrgName = async () => {
    if (!editingOrgId) return
    const name = editOrgName.trim()
    if (!name) return
    setOrgRenaming(true); setOrgError(null)
    const { error } = await supabase.from('organisations').update({ name }).eq('id', editingOrgId)
    setOrgRenaming(false)
    if (error) { setOrgError(error.message); return }
    setOrgs(o => o.map(x => x.id === editingOrgId ? { ...x, name } : x)
      .sort((a, b) => a.name.localeCompare(b.name, 'el')))
    setEditingOrgId(null)
  }

  const confirmDeleteOrg = async () => {
    if (!deleteOrg) return
    setOrgDeleting(true); setOrgError(null)
    const { error } = await supabase.from('organisations').delete().eq('id', deleteOrg.id)
    setOrgDeleting(false)
    if (error) { setOrgError(error.message); return }
    setOrgs(o => o.filter(x => x.id !== deleteOrg.id))
    setProfileList(list => list.map(p => p.organisation_id === deleteOrg.id
      ? { ...p, organisation_id: null, organisation_name: null, org_role: null }
      : p))
    setDeleteOrg(null)
  }


  // PDF search state
  const [pdfQuery, setPdfQuery] = useState('')
  const [pdfResults, setPdfResults] = useState<SolrDoc[]>([])
  const [pdfSearching, setPdfSearching] = useState(false)
  const [lastPdfQuery, setLastPdfQuery] = useState('')
  const [editingDoc, setEditingDoc] = useState<SolrDoc | null>(null)
  const [docSaving, setDocSaving] = useState(false)
  const [docError, setDocError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [hiddenFieldsOpen, setHiddenFieldsOpen] = useState(false)
  const [docCatOther, setDocCatOther] = useState(false)
  const [docSubOther, setDocSubOther] = useState(false)

  const openEditDoc = (doc: SolrDoc) => {
    setEditingDoc(doc)
    setDocError(null)
    setHiddenFieldsOpen(false)
    const cat = doc.katigoria?.[0] ?? ''
    setDocCatOther(!!cat && !categoryOptions.includes(cat))
    const sub = doc.ypokatigoria?.[0] ?? ''
    const subOpts = cat ? (hierarchy[cat] ?? []) : []
    setDocSubOther(!!sub && !subOpts.includes(sub))
  }

  const searchPdfs = async () => {
    if (!pdfQuery.trim()) return
    setPdfSearching(true)
    setLastPdfQuery(pdfQuery)
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
          ypokatigoria: editingDoc.ypokatigoria ?? [],
          organismos: editingDoc.organismos ?? [],
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
  const [userSort, setUserSort] = useState<SortDescriptor>({ column: 'first_name', direction: 'ascending' })
  const [pdfSort,  setPdfSort]  = useState<SortDescriptor>({ column: 'arithmos',    direction: 'ascending' })

  const sortProfiles = useCallback((list: Profile[]) => [...list].sort((a, b) => {
    const av = String(a[userSort.column as keyof Profile] ?? '')
    const bv = String(b[userSort.column as keyof Profile] ?? '')
    return (userSort.direction === 'ascending' ? 1 : -1) * av.localeCompare(bv, 'el')
  }), [userSort])

  // Pending registrations live in their own table; everything else in the main one.
  const pendingProfiles = useMemo(
    () => sortProfiles(profileList.filter(p => p.status === 'pending' && p.role !== 'admin')),
    [profileList, sortProfiles],
  )
  const mainProfiles = useMemo(
    () => sortProfiles(profileList.filter(p => !(p.status === 'pending' && p.role !== 'admin'))),
    [profileList, sortProfiles],
  )

  const sortedPdfResults = useMemo(() => [...pdfResults].sort((a, b) => {
    const col = pdfSort.column as keyof SolrDoc
    let av: string | number, bv: string | number
    if (col === 'etos')      { av = a.etos ?? 0;                    bv = b.etos ?? 0 }
    else if (col === 'katigoria') { av = a.katigoria?.join('') ?? ''; bv = b.katigoria?.join('') ?? '' }
    else                     { av = String(a[col] ?? '');           bv = String(b[col] ?? '') }
    const cmp = typeof av === 'number' ? av - (bv as number) : (av as string).localeCompare(bv as string, 'el')
    return pdfSort.direction === 'ascending' ? cmp : -cmp
  }), [pdfResults, pdfSort])

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

  // Status pill rendered with the heroui <Chip> (dot + label).
  const STATUS_META: Record<string, { color: 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
    approved: { color: 'success', label: 'Εγκεκριμένο' },
    pending:  { color: 'warning', label: 'Σε αναμονή' },
    rejected: { color: 'danger',  label: 'Απορρίφθηκε' },
  }
  const renderStatusChip = (status: string) => {
    const meta = STATUS_META[status] ?? { color: 'default' as const, label: status }
    return (
      <Chip color={meta.color} variant="soft" size="sm">
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        <Chip.Label>{meta.label}</Chip.Label>
      </Chip>
    )
  }

  const categoryChipClass = (cat: string) => {
    const map: Record<string, string> = {
    }
    return map[cat] ?? 'bg-violet-500/15 text-violet-400 border-violet-500/30'
  }

  const pendingCount = pendingProfiles.length

  // ── Reusable user-table cells ─────────────────────────────────────────────
  const memberCell = (p: Profile) => {
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ')
    const displayName = fullName || p.username || '—'
    return (
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 ${avatarBg(displayName)}`}>
          {getInitials(p.first_name, p.last_name, p.username)}
        </div>
        <div>
          <div className="flex items-center gap-1">
            <p className="text-gray-200">{displayName}</p>
            <div className="relative group/copy">
              <button
                type="button"
                title="Αντιγραφή"
                className="flex items-center justify-center w-6 h-6 rounded-md text-gray-500 hover:bg-white/10 hover:text-gray-200 transition"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <div className="absolute left-0 top-full pt-1 z-20 hidden group-hover/copy:block">
                <div className="min-w-[160px] rounded-xl border border-gray-700 bg-[#151518] p-1 shadow-2xl">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(p.username, `${p.id}:username`)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-white/5 hover:text-gray-100 transition"
                  >
                    {copiedField === `${p.id}:username` ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                    Αντιγραφή username
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(p.id, `${p.id}:uuid`)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-white/5 hover:text-gray-100 transition"
                  >
                    {copiedField === `${p.id}:uuid` ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                    Αντιγραφή UUID
                  </button>
                </div>
              </div>
            </div>
          </div>
          <p className="text-gray-600 text-xs font-mono">{p.id.slice(0, 8)}…</p>
        </div>
      </div>
    )
  }

  const emailCell = (p: Profile) => p.email ? (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-400">{p.email}</span>
      <button
        type="button"
        title="Αντιγραφή email"
        onClick={() => copyToClipboard(p.email, `${p.id}:email`)}
        className="flex items-center justify-center w-6 h-6 rounded-md text-gray-500 hover:bg-white/10 hover:text-gray-200 transition"
      >
        {copiedField === `${p.id}:email` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  ) : (
    <span className="text-gray-600">—</span>
  )

  const roleCell = (p: Profile) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${roleChipClass(p.role)}`}>
        {p.role ?? 'user'}
      </span>
      {p.org_role === 'org_admin' && (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border bg-sky-500/15 text-sky-400 border-sky-500/30">
          Org admin
        </span>
      )}
    </div>
  )

  const approveRejectButtons = (p: Profile) => (
    <>
      <button
        onClick={() => updateUserStatus(p.id, 'approved')}
        disabled={statusUpdating === p.id}
        title="Approve"
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs hover:bg-emerald-500/20 transition disabled:opacity-50"
      >
        {statusUpdating === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
        Approve
      </button>
      <button
        onClick={() => updateUserStatus(p.id, 'rejected')}
        disabled={statusUpdating === p.id}
        title="Reject"
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs hover:bg-red-500/20 transition disabled:opacity-50"
      >
        <UserX className="w-3.5 h-3.5" />
        Reject
      </button>
    </>
  )

  const editDeleteButtons = (p: Profile) => p.role !== 'admin' && (
    <>
      <button
        onClick={() => openEditUser(p)}
        title="Επεξεργασία"
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 border border-gray-700 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition"
      >
        <Pencil className="w-4 h-4 shrink-0" />
      </button>
      <button
        onClick={() => { setDeleteUser(p); setUserError(null) }}
        title="Διαγραφή λογαριασμού"
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition"
      >
        <Trash2 className="w-4 h-4 shrink-0" />
      </button>
    </>
  )

  // Sortable column header for the user tables.
  const userColumn = (id: string, label: string, extra: Record<string, unknown> = {}) => (
    <Table.Column allowsSorting id={id} {...extra}>
      {({ sortDirection }: { sortDirection?: 'ascending' | 'descending' }) => (
        <span className="inline-flex items-center gap-1">
          {label}
          {sortDirection && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sortDirection === 'ascending' ? 'rotate-180' : ''}`} />}
        </span>
      )}
    </Table.Column>
  )

  // Render
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'users',  label: 'Users',          icon: <Users className="w-4 h-4" /> },
    { key: 'orgs',   label: 'Organisations',  icon: <Building2 className="w-4 h-4" /> },
    { key: 'upload', label: 'Upload Dataset',  icon: <Upload className="w-4 h-4" /> },
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
              <button onClick={() => router.push('/chatbot')}className="px-6 py-2.5 rounded-full text-gray-400 hover:text-white transition text-sm font-medium">AI Chatbot</button>
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
            <Surface variant="default" className="rounded-2xl p-5 border border-border">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Users</p>
              <span className="text-3xl font-bold text-white">{userCount}</span>
            </Surface>
            <Surface variant="default" className="rounded-2xl p-5 border border-border">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />Εκκρεμείς εγγραφές
              </p>
              <span className={`text-3xl font-bold ${pendingCount ? 'text-amber-400' : 'text-white'}`}>{pendingCount}</span>
            </Surface>
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
            <div className="mt-4 space-y-6">

              {/* Pending registrations */}
              {pendingProfiles.length > 0 && (
                <Surface variant="default" className="rounded-2xl border border-amber-500/20 overflow-hidden">
                  <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      Εκκρεμείς εγγραφές
                      <Chip color="warning" variant="soft" size="sm"><Chip.Label>{pendingProfiles.length}</Chip.Label></Chip>
                    </h2>
                    <button
                      onClick={refreshUsers}
                      disabled={refreshingUsers}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-gray-700 text-gray-300 text-xs hover:bg-white/10 transition disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshingUsers ? 'animate-spin' : ''}`} />
                      Ανανέωση
                    </button>
                  </div>
                  <Table variant="secondary">
                    <Table.ScrollContainer>
                      <Table.Content aria-label="Pending registrations" className="min-w-[760px]" sortDescriptor={userSort} onSortChange={setUserSort}>
                        <Table.Header>
                          {userColumn('first_name', 'Μέλος', { isRowHeader: true })}
                          {userColumn('username', 'Username')}
                          {userColumn('email', 'Email')}
                          {userColumn('updated_at', 'Εγγραφή')}
                          <Table.Column id="actions">Ενέργειες</Table.Column>
                        </Table.Header>
                        <Table.Body items={pendingProfiles}>
                          {(p) => (
                            <Table.Row id={p.id}>
                              <Table.Cell>{memberCell(p)}</Table.Cell>
                              <Table.Cell className="text-gray-400">{p.username ?? '—'}</Table.Cell>
                              <Table.Cell>{emailCell(p)}</Table.Cell>
                              <Table.Cell className="text-gray-500 text-xs">{p.updated_at ? new Date(p.updated_at).toLocaleDateString('el-GR') : '—'}</Table.Cell>
                              <Table.Cell>
                                <div className="flex items-center justify-end gap-1.5">
                                  {approveRejectButtons(p)}
                                  {editDeleteButtons(p)}
                                </div>
                              </Table.Cell>
                            </Table.Row>
                          )}
                        </Table.Body>
                      </Table.Content>
                    </Table.ScrollContainer>
                  </Table>
                </Surface>
              )}

              {/* All users */}
              <Surface variant="default" className="rounded-2xl border border-border px-6 py-4 flex items-center justify-between gap-3">
  <h2 className="text-sm font-semibold text-white">Όλοι οι χρήστες</h2>
  <button
    onClick={refreshUsers}
    disabled={refreshingUsers}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-gray-700 text-gray-300 text-xs hover:bg-white/10 transition disabled:opacity-50"
  >
    <RefreshCw className={`w-3.5 h-3.5 ${refreshingUsers ? 'animate-spin' : ''}`} />
    Ανανέωση
  </button>
</Surface>

                {/* Table island */}
                <Surface variant="default" className="rounded-2xl border border-border overflow-hidden">
                  <Table variant="secondary">
                    <Table.ScrollContainer>
                      <Table.Content aria-label="All users" className="min-w-[900px]" sortDescriptor={userSort} onSortChange={setUserSort}>
                        <Table.Header>
                          {userColumn('first_name', 'Μέλος', { isRowHeader: true })}
                          {userColumn('username', 'Username')}
                          {userColumn('email', 'Email')}
                          {userColumn('organisation_name', 'Οργανισμός')}
                          {userColumn('role', 'Ρόλος')}
                          {userColumn('status', 'Κατάσταση')}
                          {userColumn('updated_at', 'Ενημέρωση')}
                          <Table.Column id="actions">Ενέργειες</Table.Column>
                        </Table.Header>
                        <Table.Body
                          items={mainProfiles}
                          renderEmptyState={() => (
                            <div className="px-6 py-10 text-center text-gray-600 text-sm">Δεν βρέθηκαν χρήστες.</div>
                          )}
                        >
                          {(p) => (
                            <Table.Row id={p.id}>
                              <Table.Cell>{memberCell(p)}</Table.Cell>
                              <Table.Cell className="text-gray-400">{p.username ?? '—'}</Table.Cell>
                              <Table.Cell>{emailCell(p)}</Table.Cell>
                              <Table.Cell className="text-gray-400">{p.organisation_name ?? '—'}</Table.Cell>
                              <Table.Cell>{roleCell(p)}</Table.Cell>
                              <Table.Cell>{renderStatusChip(p.status)}</Table.Cell>
                              <Table.Cell className="text-gray-500 text-xs">{p.updated_at ? new Date(p.updated_at).toLocaleDateString('el-GR') : '—'}</Table.Cell>
                              <Table.Cell>
                                <div className="flex items-center justify-end gap-1.5">
                                  {editDeleteButtons(p)}
                                </div>
                              </Table.Cell>
                            </Table.Row>
                          )}
                        </Table.Body>
                      </Table.Content>
                    </Table.ScrollContainer>
                  </Table>
                </Surface>
            </div>
            </Tabs.Panel>

            {/* ── Organisations Tab ── */}
            <Tabs.Panel id="orgs">
            <div className="mt-4 space-y-6">
              <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Organisations</h2>
                  {orgError && <p className="text-xs text-red-400">{orgError}</p>}
                </div>

                {/* Add new org */}
                <div className="px-6 py-4 border-b border-border bg-white/[0.02]">
                  <div className="flex gap-3 items-end flex-wrap">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500">Όνομα Οργανισμού
                      <input 
                        name="organisation-name"
                        placeholder="π.χ. ΔΕΔΔΗΕ"
                        value={newOrgName}
                        onChange={e => setNewOrgName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addOrg()}
                        className="w-80 px-3 py-2 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm"
                      />
                      </label>
                    </div>
                    <button
                      onClick={addOrg}
                      disabled={orgSaving || !newOrgName.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-gray-700 text-gray-300 text-sm hover:bg-white/10 transition disabled:opacity-40"
                    >
                      {orgSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Προσθήκη
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Δημιουργήστε έναν νέο οργανισμό και στη συνέχεια δημιουργήστε έναν σύνδεσμο πρόσκλησης για να προσκαλέσετε χρήστες σε αυτόν.
                  </p>
                </div>

                <div className="divide-y divide-border">
                  {orgs.map(org => (
                    <div key={org.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-3 min-w-[220px]">
                        <div className="w-9 h-9 rounded-full bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-yellow-400" />
                        </div>
                        {editingOrgId === org.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={editOrgName}
                              onChange={e => setEditOrgName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveOrgName(); if (e.key === 'Escape') setEditingOrgId(null) }}
                              className="w-44 px-3 py-1.5 rounded-lg bg-background border border-border focus:border-yellow-500/60 outline-none text-sm"
                            />
                            <button
                              onClick={saveOrgName}
                              disabled={orgRenaming || !editOrgName.trim()}
                              title="Αποθήκευση"
                              className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-50"
                            >
                              {orgRenaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => setEditingOrgId(null)}
                              title="Ακύρωση"
                              className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 border border-gray-700 text-gray-400 hover:bg-white/10 transition"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-200 text-sm font-medium">{org.name}</span>
                            <button
                              onClick={() => startEditOrg(org)}
                              title="Μετονομασία"
                              className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-500 hover:bg-white/10 hover:text-gray-300 transition"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 flex items-center gap-2 min-w-[280px]">
                        {inviteLinks[org.id] ? (
                          <>
                            <input
                              readOnly
                              value={inviteLinks[org.id]}
                              onFocus={e => e.currentTarget.select()}
                              className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-xs text-gray-400 outline-none"
                            />
                            <button
                              onClick={() => copyInvite(org.id)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-gray-700 text-gray-300 text-xs hover:bg-white/10 transition"
                            >
                              {copiedOrg === org.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                              {copiedOrg === org.id ? 'Copied' : 'Copy'}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => generateInvite(org.id)}
                            disabled={inviteCreating === org.id}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-gray-700 text-gray-300 text-sm hover:bg-white/10 transition disabled:opacity-50"
                          >
                            {inviteCreating === org.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                            Δημιουργία συνδέσμου πρόσκλησης
                          </button>
                        )}
                        <button
                          onClick={() => { setDeleteOrg(org); setOrgError(null) }}
                          title="Διαγραφή οργανισμού"
                          className="flex items-center justify-center w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {orgs.length === 0 && (
                    <div className="px-6 py-8 text-center text-gray-600 text-sm">Κανένας οργανισμός ακόμα.</div>
                  )}
                </div>
              </div>
            </div>
            </Tabs.Panel>

            {/* ── Upload Tab ── */}
            <Tabs.Panel id="upload">
            <div className="mt-4">
            <div className="space-y-6">
              <Surface variant="default" className="rounded-2xl p-6 space-y-5 border border-border">
                <h2 className="text-sm font-semibold text-white">Ανέβασμα Dataset</h2>

                {/* Category + subcategory row */}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 block">Κατηγορία</label>
                    <div className="relative">
                      <select
                        value={pendingCategory}
                        onChange={e => { setPendingCategory(e.target.value); setPendingSubcategory(''); setPendingSubcategoryOther('') }}
                        className="appearance-none bg-background border border-border text-foreground text-sm rounded-xl px-4 py-2.5 pr-10 focus:border-yellow-500/60 outline-none min-w-[200px]"
                      >
                        {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        <option value={OTHER}>Άλλο (νέα κατηγορία)…</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                    </div>
                  </div>

                  {pendingCategory === OTHER && (
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500 block">Όνομα νέας κατηγορίας</label>
                      <input
                        value={pendingCategoryOther}
                        onChange={e => setPendingCategoryOther(e.target.value)}
                        placeholder="π.χ. Φορολογικό"
                        className="bg-background border border-border text-foreground text-sm rounded-xl px-4 py-2.5 focus:border-yellow-500/60 outline-none min-w-[200px]"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 block">Υποκατηγορία</label>
                    <div className="relative">
                      <select
                        value={pendingSubcategory}
                        onChange={e => setPendingSubcategory(e.target.value)}
                        className="appearance-none bg-background border border-border text-foreground text-sm rounded-xl px-4 py-2.5 pr-10 focus:border-yellow-500/60 outline-none min-w-[200px]"
                      >
                        <option value="">— Καμία —</option>
                        {subcategoryOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        <option value={OTHER}>Άλλο (νέα υποκατηγορία)…</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                    </div>
                  </div>

                  {pendingSubcategory === OTHER && (
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500 block">Όνομα νέας υποκατηγορίας</label>
                      <input
                        value={pendingSubcategoryOther}
                        onChange={e => setPendingSubcategoryOther(e.target.value)}
                        placeholder="π.χ. Μισθώσεις"
                        className="bg-background border border-border text-foreground text-sm rounded-xl px-4 py-2.5 focus:border-yellow-500/60 outline-none min-w-[200px]"
                      />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-600">Επιλέξτε κατηγορία και (προαιρετικά) υποκατηγορία, στη συνέχεια κάντε κλικ ή σύρετε αρχεία για ανέβασμα.</p>

                {/* Drop zone — click to pick files, drop files or folders */}
                <div
                  onDrop={handleDrop}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-700 hover:border-yellow-500/50 rounded-2xl p-12 flex flex-col items-center justify-center gap-3 cursor-pointer transition"
                >
                  <Upload className="w-10 h-10 text-gray-600" />
                  <p className="text-gray-400 text-sm">Σύρετε αρχεία εδώ, ή <span className="text-yellow-400">κάντε κλικ για περιήγηση</span></p>
                  <input ref={fileInputRef} type="file" multiple accept=".pdf" className="hidden" onChange={handleFileSelect} />
                </div>

                {/* Queue */}
                {queue.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">{queue.length} αρχείο{queue.length !== 1 ? 'α' : ''} στην ουρά</span>
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
                            {item.subcategory && <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-gray-700 text-gray-500 shrink-0">{item.subcategory}</span>}
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
              </Surface>
            </div>
            </div>
            </Tabs.Panel>

            {/* ── PDF Search & Edit Tab ── */}
            <Tabs.Panel id="pdfs">
            <div className="mt-4">
            <div className="space-y-6">
              {/* Search bar */}
              <Surface variant="default" className="rounded-2xl p-6 space-y-4 border border-border">
                <h2 className="text-sm font-semibold text-white">Αναζήτηση και Επεξεργασία Αρχείων</h2>
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
              </Surface>

              {/* Results */}
              {pdfResults.length > 0 && (
                <Surface variant="default" className="rounded-2xl border border-border overflow-hidden">
                  <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-white">{pdfResults.length} αποτελέσματα</h2>
                    <button
                      onClick={searchPdfs}
                      disabled={pdfSearching || !lastPdfQuery}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-gray-700 text-gray-300 text-xs hover:bg-white/10 transition disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${pdfSearching ? 'animate-spin' : ''}`} />
                      Ανανέωση
                    </button>
                  </div>
                  <Table variant="secondary">
                    <Table.ScrollContainer>
                      <Table.Content
                        aria-label="Αποτελέσματα αναζήτησης"
                        className="min-w-[760px]"
                        sortDescriptor={pdfSort}
                        onSortChange={setPdfSort}
                      >
                        <Table.Header>
                          <Table.Column allowsSorting isRowHeader id="arithmos">
                            {({ sortDirection }: { sortDirection?: 'ascending' | 'descending' }) => <span className="inline-flex items-center gap-1">Αριθμός{sortDirection && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sortDirection === 'ascending' ? 'rotate-180' : ''}`} />}</span>}
                          </Table.Column>
                          <Table.Column allowsSorting id="dikastirio">
                            {({ sortDirection }: { sortDirection?: 'ascending' | 'descending' }) => <span className="inline-flex items-center gap-1">Δικαστήριο{sortDirection && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sortDirection === 'ascending' ? 'rotate-180' : ''}`} />}</span>}
                          </Table.Column>
                          <Table.Column allowsSorting id="etos">
                            {({ sortDirection }: { sortDirection?: 'ascending' | 'descending' }) => <span className="inline-flex items-center gap-1">Έτος{sortDirection && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sortDirection === 'ascending' ? 'rotate-180' : ''}`} />}</span>}
                          </Table.Column>
                          <Table.Column allowsSorting id="katigoria">
                            {({ sortDirection }: { sortDirection?: 'ascending' | 'descending' }) => <span className="inline-flex items-center gap-1">Κατηγορία{sortDirection && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sortDirection === 'ascending' ? 'rotate-180' : ''}`} />}</span>}
                          </Table.Column>
                          <Table.Column id="actions">Ενέργειες</Table.Column>
                        </Table.Header>
                        <Table.Body items={sortedPdfResults}>
                          {(doc) => (
                            <Table.Row id={doc.id}>
                              <Table.Cell>
                                <p className="text-gray-200 font-mono text-xs">{doc.arithmos}</p>
                                <p className="text-gray-500 text-xs truncate max-w-[220px]">{doc.titlos}</p>
                              </Table.Cell>
                              <Table.Cell className="text-gray-400 text-xs">{doc.dikastirio || '—'}</Table.Cell>
                              <Table.Cell className="text-gray-400 text-xs">{doc.etos || '—'}</Table.Cell>
                              <Table.Cell>
                                <div className="flex flex-wrap gap-1">
                                  {(doc.katigoria ?? []).map(cat => (
                                    <span key={cat} className={`px-2 py-0.5 rounded-full text-xs font-medium border ${categoryChipClass(cat)}`}>{cat}</span>
                                  ))}
                                  {!doc.katigoria?.length && <span className="text-gray-600 text-xs">—</span>}
                                </div>
                              </Table.Cell>
                              <Table.Cell>
                                <div className="flex items-center justify-end gap-1">
                                  <a
                                    href={`${BACKEND}/pdf/${encodeURIComponent(doc.katigoria?.[0] ?? '')}/${doc.pdf_path}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </a>
                                  <button onClick={() => openEditDoc(doc)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition">
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
                              </Table.Cell>
                            </Table.Row>
                          )}
                        </Table.Body>
                      </Table.Content>
                    </Table.ScrollContainer>
                  </Table>
                </Surface>
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
                <label className="text-xs text-gray-500 mb-1 block">Αριθμός (arithmos)</label>
                <input value={editingDoc.arithmos} onChange={e => setEditingDoc(d => d && ({ ...d, arithmos: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Τίτλος</label>
                <textarea value={editingDoc.titlos} onChange={e => setEditingDoc(d => d && ({ ...d, titlos: e.target.value }))} rows={3}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm resize-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Οργανισμός</label>
                <input
                  value={(editingDoc.organismos ?? []).join(', ')}
                  onChange={e => setEditingDoc(d => d && ({ ...d, organismos: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                  placeholder="π.χ. ΔΕΗ, ΑΔΜΗΕ"
                  list="org-options"
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm" />
                <datalist id="org-options">
                  {orgOptions.map(o => <option key={o} value={o} />)}
                </datalist>
                <p className="text-[11px] text-gray-600 mt-1">Διαχωρίστε πολλαπλούς οργανισμούς με κόμμα.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Κατηγορία</label>
                  <div className="relative">
                    <select
                      value={docCatOther ? OTHER : (editingDoc.katigoria?.[0] ?? '')}
                      onChange={e => {
                        const val = e.target.value
                        if (val === OTHER) {
                          setDocCatOther(true)
                          setEditingDoc(d => d && ({ ...d, katigoria: [''], ypokatigoria: [] }))
                          setDocSubOther(false)
                        } else {
                          setDocCatOther(false)
                          setEditingDoc(d => d && ({ ...d, katigoria: [val], ypokatigoria: [] }))
                          setDocSubOther(false)
                        }
                      }}
                      className="w-full appearance-none px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm pr-10"
                    >
                      <option value="">— Καμία —</option>
                      {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value={OTHER}>Άλλο (νέα κατηγορία)…</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                  {docCatOther && (
                    <input
                      value={editingDoc.katigoria?.[0] ?? ''}
                      onChange={e => setEditingDoc(d => d && ({ ...d, katigoria: [e.target.value] }))}
                      placeholder="Όνομα νέας κατηγορίας"
                      className="mt-2 w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm" />
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Υποκατηγορία</label>
                  <div className="relative">
                    <select
                      value={docSubOther ? OTHER : (editingDoc.ypokatigoria?.[0] ?? '')}
                      onChange={e => {
                        const val = e.target.value
                        if (val === OTHER) {
                          setDocSubOther(true)
                          setEditingDoc(d => d && ({ ...d, ypokatigoria: [''] }))
                        } else {
                          setDocSubOther(false)
                          setEditingDoc(d => d && ({ ...d, ypokatigoria: val ? [val] : [] }))
                        }
                      }}
                      className="w-full appearance-none px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm pr-10"
                    >
                      <option value="">— Καμία —</option>
                      {(hierarchy[editingDoc.katigoria?.[0] ?? ''] ?? []).map(s => <option key={s} value={s}>{s}</option>)}
                      <option value={OTHER}>Άλλο (νέα υποκατηγορία)…</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                  {docSubOther && (
                    <input
                      value={editingDoc.ypokatigoria?.[0] ?? ''}
                      onChange={e => setEditingDoc(d => d && ({ ...d, ypokatigoria: [e.target.value] }))}
                      placeholder="Όνομα νέας υποκατηγορίας"
                      className="mt-2 w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm" />
                  )}
                </div>
              </div>

              {/* Hidden fields drawer */}
              <div className="border border-border rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setHiddenFieldsOpen(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-400 hover:bg-white/5 transition"
                >
                  <span>Κρυμμένα πεδία</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${hiddenFieldsOpen ? 'rotate-180' : ''}`} />
                </button>
                {hiddenFieldsOpen && (
                  <div className="grid grid-cols-2 gap-4 px-4 pb-4 pt-1">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Δικαστήριο (dikastirio)</label>
                      <input value={editingDoc.dikastirio} onChange={e => setEditingDoc(d => d && ({ ...d, dikastirio: e.target.value }))}
                        className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Έτος</label>
                      <input type="number" value={editingDoc.etos} onChange={e => setEditingDoc(d => d && ({ ...d, etos: Number(e.target.value) }))}
                        className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm" />
                    </div>
                  </div>
                )}
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

      {/* Edit User Modal — organisation + org role */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setEditingUser(null)} />
          <div className="relative bg-surface border border-border rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Επεξεργασία χρήστη</h3>
              <button onClick={() => setEditingUser(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 transition"><X className="w-4 h-4" /></button>
            </div>

            <p className="text-sm text-gray-400">
              {[editingUser.first_name, editingUser.last_name].filter(Boolean).join(' ') || editingUser.username || editingUser.id.slice(0, 8)}
            </p>

            {userError && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{userError}</p>}

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Οργανισμός</label>
                <div className="relative">
                  <select
                    value={editOrgId}
                    onChange={e => setEditOrgId(e.target.value)}
                    className="w-full appearance-none px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm pr-10"
                  >
                    <option value="">— Κανένας —</option>
                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
              </div>

              {editOrgId && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Ρόλος στον οργανισμό</label>
                  <div className="relative">
                    <select
                      value={editOrgRole}
                      onChange={e => setEditOrgRole(e.target.value)}
                      className="w-full appearance-none px-4 py-2.5 rounded-xl bg-background border border-border focus:border-yellow-500/60 outline-none text-sm pr-10"
                    >
                      <option value="member">Μέλος</option>
                      <option value="org_admin">Διαχειριστής οργανισμού</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1">Ο διαχειριστής οργανισμού μπορεί να προσκαλεί και να διαχειρίζεται τα μέλη του οργανισμού του.</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditingUser(null)} className="px-5 py-2 rounded-full bg-white/5 border border-border text-muted text-sm hover:bg-white/10 transition">
                Ακύρωση
              </button>
              <button onClick={saveUser} disabled={userSaving} className="flex items-center gap-2 px-5 py-2 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-sm hover:bg-yellow-500/25 transition disabled:opacity-50">
                {userSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Αποθήκευση
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User confirm */}
      {deleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => !userDeleting && setDeleteUser(null)} />
          <div className="relative bg-surface border border-border rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-base font-semibold text-white">Διαγραφή λογαριασμού</h3>
            </div>
            <p className="text-sm text-gray-400">
              Πρόκειται να διαγράψετε οριστικά τον λογαριασμό{' '}
              <span className="text-gray-200">{[deleteUser.first_name, deleteUser.last_name].filter(Boolean).join(' ') || deleteUser.username || deleteUser.id.slice(0, 8)}</span>.
              Αυτή η ενέργεια δεν αναιρείται.
            </p>
            {userError && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{userError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteUser(null)} disabled={userDeleting} className="px-5 py-2 rounded-full bg-white/5 border border-border text-muted text-sm hover:bg-white/10 transition disabled:opacity-50">
                Ακύρωση
              </button>
              <button onClick={confirmDeleteUser} disabled={userDeleting} className="flex items-center gap-2 px-5 py-2 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 text-sm hover:bg-red-500/25 transition disabled:opacity-50">
                {userDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Διαγραφή
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Organisation confirm */}
      {deleteOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => !orgDeleting && setDeleteOrg(null)} />
          <div className="relative bg-surface border border-border rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-base font-semibold text-white">Διαγραφή οργανισμού</h3>
            </div>
            <p className="text-sm text-gray-400">
              Πρόκειται να διαγράψετε τον οργανισμό <span className="text-gray-200">{deleteOrg.name}</span>.
              Τα μέλη του θα αποσυνδεθούν από αυτόν. Αυτή η ενέργεια δεν αναιρείται.
            </p>
            {orgError && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{orgError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteOrg(null)} disabled={orgDeleting} className="px-5 py-2 rounded-full bg-white/5 border border-border text-muted text-sm hover:bg-white/10 transition disabled:opacity-50">
                Ακύρωση
              </button>
              <button onClick={confirmDeleteOrg} disabled={orgDeleting} className="flex items-center gap-2 px-5 py-2 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 text-sm hover:bg-red-500/25 transition disabled:opacity-50">
                {orgDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Διαγραφή
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
