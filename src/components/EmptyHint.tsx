import { StateView } from './StateView.tsx'

/** @deprecated Prefer `StateView` with explicit `variant`. Kept for compat. */
export function EmptyHint({
  title,
  actionLabel,
  onAction,
  description,
  variant = 'empty',
}: {
  title: string
  actionLabel?: string
  onAction?: () => void
  description?: string
  variant?: 'empty' | 'filtered-empty' | 'error'
}) {
  return (
    <StateView
      variant={variant}
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  )
}
