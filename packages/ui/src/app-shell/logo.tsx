import { cn } from '../lib/cn'
import { AppMark, brandName } from './app-mark'
import { solid } from './logo-mark'
import { wordmarkPath } from './wordmark-path'

export { LogoMark } from './logo-mark'

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

/**
 * The logo at the top of the sidebar: the app's mark (see `AppMark`), then the app's name, as the brand's
 * wordmark when the app goes by Protobase's name and has no icon of its own, with the workspace's name under it; the
 * icon alone when compact.
 */
export const Logo = ({ compact, workspace, appName, appIcon }: ShellLogoProps) => (
  <div className="flex items-center gap-2.5 overflow-hidden">
    <AppMark appName={appName} appIcon={appIcon} />
    {!compact && (
      <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
        {appIcon || (appName && appName !== brandName) ? <div className="truncate text-sm font-semibold text-foreground">{appName ?? brandName}</div> : <Wordmark className="self-start" />}
        {workspace && <div className="truncate text-[0.6875rem] text-muted-foreground">{workspace}</div>}
      </div>
    )}
  </div>
)
