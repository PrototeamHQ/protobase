import { describe, expect, it } from 'vitest'
import { mailboxOffers } from './mailbox-offers'

const gmail = { id: 'gmail', name: 'Gmail', provider: 'google', scopes: ['https://www.googleapis.com/auth/gmail.send'], params: {} }
const other = { id: 'other', name: 'Other mail', provider: 'other', scopes: ['send'], params: {} }

describe('mailboxOffers', () => {
  it('offers to connect a mailbox before a send while none is linked', () => {
    expect(mailboxOffers([gmail], { mail: [], providers: [] })).toEqual([{ link: gmail, again: false, signInOnly: false }])
  })

  it('offers nothing before a send once a mailbox is linked', () => {
    expect(mailboxOffers([gmail], { mail: ['gmail'], providers: ['google'] })).toEqual([])
  })

  it('counts a Google sign-in without leave to send as no mailbox, and says so', () => {
    expect(mailboxOffers([gmail], { mail: [], providers: ['google'] })).toEqual([{ link: gmail, again: false, signInOnly: true }])
    expect(mailboxOffers([gmail], { mail: [], providers: ['google'] }, { code: 'not_linked' })).toEqual([{ link: gmail, again: false, signInOnly: true }])
  })

  it('offers a mailbox the server found unlinked again when the account still shows it linked', () => {
    expect(mailboxOffers([gmail], { mail: ['gmail'], providers: ['google'] }, { code: 'not_linked' })).toEqual([{ link: gmail, again: true, signInOnly: false }])
  })

  it('offers an expired link again, for the provider the server named', () => {
    expect(mailboxOffers([gmail, other], { mail: ['gmail'], providers: ['google'] }, { code: 'link_expired', provider: 'gmail' })).toEqual([{ link: gmail, again: true, signInOnly: false }])
  })

  it('offers every mailbox again when an expired link names no provider the app has', () => {
    expect(mailboxOffers([gmail, other], { mail: [], providers: [] }, { code: 'link_expired' })).toEqual([
      { link: gmail, again: true, signInOnly: false },
      { link: other, again: true, signInOnly: false },
    ])
  })
})
