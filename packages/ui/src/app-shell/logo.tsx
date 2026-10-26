import { cn } from '../lib/cn'
import { wordmarkPath } from './wordmark-path'

// The brand's colours, not the theme's: the corner is signal, the rest ink on light and paper on dark, whatever primary
// colour an app's theme picks.
const corner = 'fill-[#ff5a1f] dark:fill-[#ff6a33]'
const solid = 'fill-[#14161a] dark:fill-[#f1f0ea]'

/** The Protobase mark, the Corner: the outlined corner is what an app describes, the solid rest what Protobase runs. */
export const LogoMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={cn('size-7 shrink-0', className)} aria-hidden>
    <path className={corner} fillRule="evenodd" d="M0 5a5 5 0 0 1 5-5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zM4 5a1 1 0 0 1 1-1h5v6H4z" />
    <path className={solid} d="M17 0h10a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5H5a5 5 0 0 1-5-5V17h17z" />
  </svg>
)

/** The name "protobase", outlined as the brand draws it rather than set in a font. */
export const Wordmark = ({ className }: { className?: string }) => (
  <svg viewBox="54.8 -720 3743.8 925" className={cn('h-3.5 w-auto', className)} role="img" aria-label="Protobase">
    <path className={solid} d={wordmarkPath} />
  </svg>
)

/**
 * What the logo at the top of the sidebar gets: `compact` when the sidebar shows only icons, the workspace's name, the
 * app's name, such as `Property Finder` (`PROTOBASE_APP_NAME` or `auth.appName`), and the path of its own
 * icon, its `protobase.favicon.svg`, when the project has one.
 */
export type ShellLogoProps = { compact: boolean; workspace?: string; appName?: string; appIcon?: string }

// The name an app goes by when it names itself nothing
const brandName = 'Protobase'

/**
 * The logo at the top of the sidebar: the app's own icon, else Protobase's mark, then the app's name, as the brand's
 * wordmark when the app goes by Protobase's name and has no icon of its own, with the workspace's name under it; the
 * icon alone when compact.
 */
export const Logo = ({ compact, workspace, appName, appIcon }: ShellLogoProps) => (
  <div className="flex items-center gap-2.5 overflow-hidden">
    {appIcon ? <img src={appIcon} alt="" className="size-7 shrink-0 object-contain" /> : <LogoMark />}
    {!compact && (
      <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
        {appIcon || (appName && appName !== brandName) ? <div className="truncate text-sm font-semibold text-foreground">{appName ?? brandName}</div> : <Wordmark className="self-start" />}
        {workspace && <div className="truncate text-[11px] text-muted-foreground">{workspace}</div>}
      </div>
    )}
  </div>
)
