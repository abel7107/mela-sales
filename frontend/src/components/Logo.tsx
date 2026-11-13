interface LogoProps {
  compact?: boolean
  light?: boolean
}

export function Logo({ compact = false, light = false }: LogoProps) {
  return (
    <div className={`flex items-center ${compact ? '' : 'flex-col gap-2'}`}>
      <img
        src="/large.png"
        alt="Mela Sales logo"
        className={compact ? 'h-9 w-9 object-contain' : 'h-12 w-12 object-contain'}
      />
      {!compact && (
        <span className={`text-sm font-black tracking-[0.12em] ${
          light ? 'text-white' : 'text-slate-900 dark:text-slate-100'
        }`}>
          MELA SALES
        </span>
      )}
    </div>
  )
}
