'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Chip, Card, Table, Button, Avatar, EmptyState } from '@heroui/react'
import {
  Building2, Users, Link2, Copy, Check, Loader2,
  UserMinus, ArrowLeft, Clock,
} from 'lucide-react'
import { AuthButton } from '@/components/AuthButton'
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type Member = {
  id: string
  first_name: string | null
  last_name: string | null
  username: string | null
  status: string
  org_role: string | null
  updated_at: string | null
}

interface Props {
  organisationId: string
  organisationName: string
  currentUserId: string
  members: Member[]
}

const STATUS_META: Record<string, { color: 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
  approved: { color: 'success', label: 'Εγκεκριμένο' },
  pending:  { color: 'warning', label: 'Σε αναμονή' },
  rejected: { color: 'danger',  label: 'Απορρίφθηκε' },
}

export default function OrgDashboard({ organisationId, organisationName, currentUserId, members: initial }: Props) {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()!

  const [members, setMembers] = useState<Member[]>(initial)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteCreating, setInviteCreating] = useState(false)
  const [copied, setCopied] = useState(false)

  const generateInvite = async () => {
    setInviteCreating(true); setError(null)
    const { data, error } = await supabase
      .from('invite_tokens')
      .insert({ organisation_id: organisationId })
      .select('token')
      .single()
    setInviteCreating(false)
    if (error) { setError(error.message); return }
    if (data) setInviteLink(`${window.location.origin}/auth/register?token=${data.token}`)
  }

  const copyInvite = async () => {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const removeMember = async (id: string) => {
    setUpdating(id); setError(null)
    const { error } = await supabase.rpc('org_remove_member', { p_user: id })
    setUpdating(null)
    if (error) { setError(error.message); return }
    setMembers(list => list.filter(m => m.id !== id))
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

  const avatarBg = (name: string) => {
    const cs = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-rose-500', 'bg-amber-500', 'bg-cyan-600']
    return cs[name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % cs.length]
  }
  const getInitials = (m: Member) =>
    [m.first_name?.[0], m.last_name?.[0]].filter(Boolean).join('').toUpperCase() || m.username?.[0]?.toUpperCase() || '?'

  const pendingCount = members.filter(m => m.status === 'pending').length

  return (
    <div className="min-h-screen text-white font-sans selection:bg-yellow-500/30" data-theme="dark">
      <div className="fixed inset-0 -z-10">
        <BackgroundGradientAnimation interactive />
        <div className="absolute inset-0 bg-black/55" />
      </div>

      <div className="relative z-10 min-h-screen">
        <nav className="relative z-10">
          <div className="flex items-center px-8 py-6 max-w-6xl mx-auto">
            <button onClick={() => router.push('/')} className="flex-1 flex items-center gap-2 text-gray-400 hover:text-white transition text-sm">
              <ArrowLeft className="w-4 h-4" /> Αρχική
            </button>
            <div className="flex-1 flex items-center justify-end">
              <AuthButton />
            </div>
          </div>
        </nav>

        <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{organisationName}</h1>
              <p className="text-sm text-gray-500">Διαχείριση μελών οργανισμού</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card variant="secondary" className="flex-row items-center gap-4 p-5">
              <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-sky-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted uppercase tracking-wider">Μέλη</span>
                <span className="text-3xl font-bold text-foreground leading-tight">{members.length}</span>
              </div>
            </Card>
            <Card variant="secondary" className="flex-row items-center gap-4 p-5">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted uppercase tracking-wider">Σε αναμονή</span>
                <span className="text-3xl font-bold text-amber-400 leading-tight">{pendingCount}</span>
              </div>
            </Card>
          </div>

          {/* Invite */}
          <Card variant="secondary" className="gap-3 p-6">
            <Card.Header className="gap-1">
              <Card.Title className="text-sm">Πρόσκληση μέλους</Card.Title>
              <Card.Description className="text-xs">
                Δημιουργήστε έναν σύνδεσμο πρόσκλησης και στείλτε τον στο άτομο που θέλετε να προσθέσετε στον οργανισμό σας.
              </Card.Description>
            </Card.Header>
            <Card.Content className="p-0">
              <div className="flex items-center gap-2 flex-wrap">
                {inviteLink ? (
                  <>
                    <input
                      readOnly
                      value={inviteLink}
                      onFocus={e => e.currentTarget.select()}
                      className="flex-1 min-w-[260px] px-3 py-2 rounded-xl bg-background border border-border text-xs text-muted outline-none"
                    />
                    <Button size="sm" variant="secondary" onPress={copyInvite}>
                      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}
                    </Button>
                    <Button size="sm" variant="secondary" isDisabled={inviteCreating} onPress={generateInvite}>
                      {inviteCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                      Νέος σύνδεσμος
                    </Button>
                  </>
                ) : (
                  <Button size="sm" isDisabled={inviteCreating} onPress={generateInvite}>
                    {inviteCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    Δημιουργία συνδέσμου πρόσκλησης
                  </Button>
                )}
              </div>
              {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
            </Card.Content>
          </Card>

          {/* Members */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Users className="w-4 h-4 text-muted" />
              <h2 className="text-sm font-semibold text-foreground">Μέλη</h2>
            </div>
            <Table aria-label="Μέλη οργανισμού">
              <Table.ScrollContainer>
                <Table.Content aria-label="Μέλη οργανισμού" className="min-w-[640px]">
                  <Table.Header>
                    <Table.Column isRowHeader>Μέλος</Table.Column>
                    <Table.Column>Ρόλος</Table.Column>
                    <Table.Column>Κατάσταση</Table.Column>
                    <Table.Column className="text-right">Ενέργειες</Table.Column>
                  </Table.Header>
                  <Table.Body
                    renderEmptyState={() => (
                      <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-2 py-10 text-center">
                        <span className="text-sm text-muted">Κανένα μέλος ακόμα.</span>
                      </EmptyState>
                    )}
                  >
                    {members.map(m => {
                      const displayName = [m.first_name, m.last_name].filter(Boolean).join(' ') || m.username || '—'
                      const isSelf = m.id === currentUserId
                      return (
                        <Table.Row key={m.id} id={m.id}>
                          <Table.Cell>
                            <div className="flex items-center gap-3">
                              <Avatar className={`size-8 text-white text-xs font-semibold ${avatarBg(displayName)}`}>
                                <Avatar.Fallback>{getInitials(m)}</Avatar.Fallback>
                              </Avatar>
                              <span className="text-foreground">{displayName}{isSelf && <span className="text-muted"> (εσείς)</span>}</span>
                            </div>
                          </Table.Cell>
                          <Table.Cell>
                            {m.org_role === 'org_admin'
                              ? <Chip color="default" variant="tertiary" size="sm"><Chip.Label className="text-blue-400">Διαχειριστής Οργανισμού</Chip.Label></Chip>
                              : <Chip variant="soft" size="sm"><Chip.Label>Μέλος</Chip.Label></Chip>}
                          </Table.Cell>
                          <Table.Cell>{renderStatusChip(m.status)}</Table.Cell>
                          <Table.Cell className="text-right">
                            {!isSelf && (
                              <Button
                                isIconOnly
                                size="sm"
                                variant="secondary"
                                isDisabled={updating === m.id}
                                aria-label="Αφαίρεση από οργανισμό"
                                onPress={() => removeMember(m.id)}
                              >
                                {updating === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                              </Button>
                            )}
                          </Table.Cell>
                        </Table.Row>
                      )
                    })}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
        </div>
      </div>
    </div>
  )
}
