interface Props {
  readonly message?: string
  readonly compact?: boolean
}

export function ErrorMessage({ message = 'Failed to load data', compact = false }: Props) {
  if (compact) {
    return (
      <div className="text-red-400 text-xs font-mono px-2 py-1">
        ⚠ {message}
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center gap-2 h-full text-center p-4">
      <div className="text-red-400 text-2xl">⚠</div>
      <div className="text-red-400 text-sm font-mono">{message}</div>
    </div>
  )
}
