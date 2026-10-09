import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../primitives/button'
import { AuthLayout } from './auth-layout'

export const createAdminCommand = 'protobase users create you@example.com'

export type FirstRunPageProps = { command?: string; onCheckAgain: () => void; busy?: boolean }

/**
 * Shown while the admin store has no user. Accounts are not created over the web (a fresh URL must not be claimable
 * by whoever reaches it first), so this says how to create the first admin on the host.
 */
export const FirstRunPage = ({ command = createAdminCommand, onCheckAgain, busy }: FirstRunPageProps) => {
  const [copied, setCopied] = useState(false)
  return (
    <AuthLayout title="No admin yet" description="This Protobase has no users to sign in with.">
      <p className="text-[13px] text-muted-foreground">Run this in the terminal where Protobase runs, then reload. The first admin is created on the server, not in the browser, so nobody else can claim a fresh URL.</p>
      <div className="mt-4 flex items-center gap-2 rounded-md border bg-surface py-1.5 pl-3 pr-1.5">
        <code className="min-w-0 flex-1 break-all font-mono text-xs">{command}</code>
        <button
          type="button"
          aria-label="Copy command"
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
      <Button variant="primary" className="mt-4 min-h-10 w-full" loading={busy} onClick={onCheckAgain}>
        Reload
      </Button>
    </AuthLayout>
  )
}
