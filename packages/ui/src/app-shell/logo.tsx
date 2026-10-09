import { cn } from '../lib/cn'

export const LogoMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={cn('size-7 shrink-0', className)} aria-hidden>
    <rect width="24" height="24" rx="6" className="fill-primary" />
    <path d="M7 17V7h5.2a3 3 0 0 1 0 6H7" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12.5 17h4.5" stroke="white" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

export const Logo = ({ showName, workspace }: { showName: boolean; workspace?: string }) => (
  <div className="flex items-center gap-2.5 overflow-hidden">
    <LogoMark />
    {showName && (
      <div className="min-w-0 leading-tight">
        <div className="text-[13px] font-semibold tracking-tight">Protobase</div>
        {workspace && <div className="truncate text-[11px] text-muted-foreground">{workspace}</div>}
      </div>
    )}
  </div>
)
