import { ExternalLink } from 'lucide-react'
import { buttonClass } from '../primitives/button'
import { AccountSection } from './account-section'
import { connectorDialogUrl } from './connector-dialog'
import { CopyField } from './copy-field'
import { text } from './messages'

/** The address of the app's MCP endpoint, to copy into an AI client or add to Claude, with how connecting goes. */
export const McpAddressSection = ({ url, appName }: { url: string; appName?: string }) => (
  <AccountSection title={text('mcpAddress')} description={text('mcpAddressDescription')}>
    <div className="flex flex-wrap items-center gap-2">
      <CopyField value={url} copyLabel={text('copyMcpAddress')} />
      <a href={connectorDialogUrl(url, appName)} target="_blank" rel="noreferrer" className={buttonClass()}>
        <ExternalLink className="size-3.5" />
        {text('addToClaude')}
      </a>
    </div>
  </AccountSection>
)
