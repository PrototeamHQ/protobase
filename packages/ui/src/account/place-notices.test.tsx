import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ListingNotices } from './listing-notices'
import { placeNotices } from './place-notices'
import { SignInProvidersSection } from './sign-in-providers-section'
import type { ListingProblem } from './use-sender-refresh'

// The Mailbox section as the block draws it for a linked Gmail, with the notices its checks leave there.
const mailbox = (notices: ListingProblem[]) => {
  const placed = placeNotices(notices)
  const html = renderToStaticMarkup(
    <SignInProvidersSection providers={[{ id: 'gmail', name: 'Gmail' }]} linked={['gmail']} reconnect notConnected={placed.notConnected} connectElsewhere={placed.connectElsewhere} onConnect={async () => {}}>
      <ListingNotices notices={placed.mailbox} providerName={() => 'Gmail'} onConnect={() => {}} />
    </SignInProvidersSection>,
  )
  return { placed, html, buttons: [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(([, label]) => label) }
}

describe('the Mailbox section', () => {
  it('says a working link is connected, and offers to connect it again', () => {
    const { html, buttons } = mailbox([])
    expect(html).toContain('>Connected<')
    expect(html).not.toContain('Not connected')
    expect(buttons).toEqual(['Connect Gmail again'])
  })

  it('says a link Gmail refused is not connected, with its card as the one button', () => {
    const { placed, html, buttons } = mailbox([{ provider: 'gmail', kind: 'expired' }])
    expect(html).toContain('>Not connected<')
    expect(html).not.toContain('>Connected<')
    expect(html).toContain('no longer accepts')
    expect(buttons).toEqual(['Connect Gmail again'])
    expect(placed.fromAddresses).toEqual([])
  })

  it('leaves a missing scope to the From addresses, whose card connects, so the row offers no button', () => {
    const { placed, html, buttons } = mailbox([{ provider: 'gmail', kind: 'not_permitted' }])
    expect(html).toContain('>Connected<')
    expect(buttons).toEqual([])
    expect(placed.fromAddresses).toEqual([{ provider: 'gmail', kind: 'not_permitted' }])
  })

  it('keeps the row button beside a failed check, which offers no connect', () => {
    const { placed, buttons } = mailbox([{ provider: 'gmail', kind: 'failed' }])
    expect(buttons).toEqual(['Connect Gmail again'])
    expect(placed.fromAddresses).toEqual([{ provider: 'gmail', kind: 'failed' }])
  })
})
