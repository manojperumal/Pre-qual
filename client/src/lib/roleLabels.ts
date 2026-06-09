const ROLE_LABELS: Record<string, string> = {
  gc: 'General Contractor',
  gc_member: 'General Contractor (Member)',
  owner: 'Owner',
  owner_member: 'Owner (Member)',
  trade: 'Trade',
  trade_member: 'Trade (Member)',
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return '—'
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
