export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/90 ${className}`} />
}

export function EmptyHint({
  title,
  actionLabel,
  onAction,
}: {
  title: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <p className="text-sm text-slate-500">{title}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
