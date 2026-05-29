import { PrequalStatus, InvitationStatus } from '@/types'
import clsx from 'clsx'

type Status = PrequalStatus | InvitationStatus

const STATUS_CONFIG: Record<Status, { label: string; classes: string }> = {
  draft: {
    label: 'Draft',
    classes: 'bg-gray-100 text-gray-700 border-gray-200',
  },
  submitted: {
    label: 'Submitted',
    classes: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  under_review: {
    label: 'Under Review',
    classes: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  },
  approved: {
    label: 'Approved',
    classes: 'bg-green-100 text-green-700 border-green-200',
  },
  rejected: {
    label: 'Rejected',
    classes: 'bg-red-100 text-red-700 border-red-200',
  },
  pending: {
    label: 'Pending',
    classes: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  accepted: {
    label: 'Accepted',
    classes: 'bg-green-100 text-green-700 border-green-200',
  },
  expired: {
    label: 'Expired',
    classes: 'bg-gray-100 text-gray-500 border-gray-200',
  },
}

interface StatusBadgeProps {
  status: Status
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    classes: 'bg-gray-100 text-gray-700 border-gray-200',
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        config.classes
      )}
    >
      {config.label}
    </span>
  )
}
