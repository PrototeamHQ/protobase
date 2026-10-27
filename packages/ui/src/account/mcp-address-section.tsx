import { Check, Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { buttonClass } from '../primitives/button'
import { AccountSection } from './account-section'
import { connectorDialogUrl } from './connector-dialog'
import { text } from './messages'

/** The address of the app's MCP endpoint, to copy into an AI client or add to Claude, with how connecting goes. */
export const McpAddressSection = ({ url, appName }: { url: string; appName?: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <AccountSection title={text('mcpAddress')} description={text('mcpAddressDescription')}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-surface py-1.5 pl-3 pr-1.5">
          <code className="min-w-0 flex-1 break-all font-mono text-xs">{url}</code>
          <button
            type="button"
            aria-label={copied ? text('copied') : text('copyMcpAddress')}
            onClick={() => {
              void navigator.clipboard.writeText(url).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              })
            }}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted pointer-coarse:size-11"
          >
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
          </button>
        </div>
        <a href={connectorDialogUrl(url, appName)} target="_blank" rel="noreferrer" className={buttonClass()}>
          <ExternalLink className="size-3.5" />
          {text('addToClaude')}
        </a>
      </div>
    </AccountSection>
  )
}
