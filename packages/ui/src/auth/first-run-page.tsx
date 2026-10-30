import { Check, Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Button, buttonClass } from '../primitives/button'
import { cn } from '../lib/cn'
import { AuthLayout } from './auth-layout'
import { text } from './messages'

export const createAdminCommand = 'protobase users create you@example.com'

export type FirstRunPageProps = { command?: string; firstAdminUrl?: string; onCheckAgain: () => void; busy?: boolean }

/**
 * Shown while the admin store has no user. Accounts are not created over the web (a fresh URL must not be claimable
 * by whoever reaches it first), so this says how to create the first admin on the host, or, with `firstAdminUrl`,
 * links to the platform's page where it is added, since nobody hosted there can run the command.
 */
export const FirstRunPage = ({ command = createAdminCommand, firstAdminUrl, onCheckAgain, busy }: FirstRunPageProps) => (
  <AuthLayout title={text('noAdminTitle')} description={text('noAdminDescription')}>
    {firstAdminUrl ? <ConsoleLink url={firstAdminUrl} /> : <CommandBox command={command} />}
    <Button variant={firstAdminUrl ? 'secondary' : 'primary'} className="mt-4 min-h-10 w-full" loading={busy} onClick={onCheckAgain}>
      {text('reload')}
    </Button>
  </AuthLayout>
)

// In a new tab, so this one stays to reload once the user is added.
const ConsoleLink = ({ url }: { url: string }) => (
  <>
    <p className="text-muted-foreground">{text('firstAdminExplanation')}</p>
    <a href={url} target="_blank" rel="noopener noreferrer" className={cn(buttonClass({ variant: 'primary' }), 'mt-4 min-h-10 w-full')}>
      {text('firstAdminLink')}
      <ExternalLink className="size-4" />
    </a>
  </>
)

const CommandBox = ({ command }: { command: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <>
      <p className="text-muted-foreground">{text('noAdminExplanation')}</p>
      <div className="mt-4 flex items-center gap-2 rounded-md border bg-surface py-1.5 pl-3 pr-1.5">
        <code className="min-w-0 flex-1 break-all font-mono text-xs">{command}</code>
        <button
          type="button"
          aria-label={text('copyCommand')}
          onClick={() => {
            void navigator.clipboard.writeText(command).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted pointer-coarse:size-11"
        >
          {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        </button>
      </div>
    </>
  )
}
