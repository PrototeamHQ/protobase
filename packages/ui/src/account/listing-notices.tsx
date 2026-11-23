import { ActionCard } from '../action-card/action-card'
import type { ListingProblem } from './use-sender-refresh'
import { text } from './messages'

const titles = { not_permitted: 'listingNotPermittedTitle', expired: 'listingExpiredTitle', failed: 'listingFailedTitle' } as const
const messages = { not_permitted: 'listingNotPermitted', expired: 'listingExpired', failed: 'listingFailed' } as const

type ListingNoticesProps = { notices: ListingProblem[]; providerName: (provider: string) => string; onConnect: (provider: string) => void }

/**
 * Why the send-as addresses of a mailbox could not be read, one card per provider: a link without the scope to read
 * them, or one that no longer works, offers to connect the mailbox again; a failed listing only says so.
 */
export const ListingNotices = ({ notices, providerName, onConnect }: ListingNoticesProps) => {
  if (notices.length === 0) return null
  return (
    <div className="mb-3 flex flex-col gap-2">
      {notices.map(({ provider, kind }) => {
        const name = providerName(provider)
        return (
          <ActionCard
            key={provider}
            title={text(titles[kind], { name })}
            tone={kind === 'not_permitted' ? 'info' : 'warning'}
            // Allowing the checks is optional, so its button is not the page's heaviest; a refused link stops sending.
            actions={kind === 'failed' ? [] : [{ id: provider, label: text(kind === 'not_permitted' ? 'allowAddressChecks' : 'connectAgain', { name }), style: kind === 'not_permitted' ? 'secondary' : 'primary' }]}
            onAction={onConnect}
          >
            <p className="text-body">{text(messages[kind], { name })}</p>
          </ActionCard>
        )
      })}
    </div>
  )
}
