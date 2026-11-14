import { describe, expect, it } from 'vitest'
import * as built from '../blocks'
import { blockSpecs } from '../block-specs'
import { Box, Column, Row, Text } from '../elements'
import type { LayoutNode } from '../node'
import { renderText } from './render-text'

const text = Text({ children: 'Inside' })

// One element of each built-in block, as a page would hold it
const samples: Record<string, LayoutNode> = {
  Page: built.Page({ title: 'Home', children: text }),
  Grid: built.Grid({ children: text }),
  Card: built.Card({ title: 'Totals', children: text }),
  Stat: built.Stat({ label: 'Open', resource: 'tasks', filter: "state = 'open'" }),
  RecordCard: built.RecordCard({ resource: 'tasks', recordKey: '1', children: text }),
  Field: built.Field({ name: 'title' }),
  Table: built.Table({ resource: 'tasks', title: 'Tasks' }),
  CardRow: built.CardRow({ resource: 'tasks', children: text }),
  RecordRow: built.RecordRow({ resource: 'tasks', filter: "state = 'open'" }),
  RecordCards: built.RecordCards({ resource: 'tasks' }),
  Chart: built.Chart({ resource: 'tasks', groupBy: 'state', title: 'By state' }),
  Progress: built.Progress({ label: 'Done', value: 40 }),
  ModalForm: built.ModalForm({ mode: 'create', label: 'New task', fields: ['title'] }),
  Thread: built.Thread({ resource: 'messages', sender: 'author', time: 'sent_at', text: 'body' }),
  Composer: built.Composer({ resource: 'messages', field: 'body', placeholder: 'Write a message' }),
  Image: built.Image({ function: 'map', alt: 'The system map' }),
  Action: built.Action({ name: 'approve', label: 'Approve' }),
  Show: built.Show({ when: "state = 'open'", children: text }),
  Switch: built.Switch({ children: built.Match({ when: "state = 'open'", children: text }) }),
  Match: built.Match({ when: "state = 'open'", children: text }),
  Link: built.Link({ href: 'https://example.com', children: 'Example' }),
  Tabs: built.Tabs({ children: built.Tab({ name: 'one', label: 'One', children: text }) }),
  Tab: built.Tab({ name: 'one', label: 'One', children: text }),
  Settings: built.Settings({ resource: 'preferences', title: 'Preferences' }),
  Users: built.Users({}),
  Profile: built.Profile({}),
  Password: built.Password({}),
  Passkeys: built.Passkeys({}),
  TwoFactor: built.TwoFactor({}),
  ConnectedAccounts: built.ConnectedAccounts({}),
  PersonalMail: built.PersonalMail({}),
  Connections: built.Connections({}),
  Devices: built.Devices({}),
  ConnectedApps: built.ConnectedApps({}),
  PersonalAccessTokens: built.PersonalAccessTokens({}),
  DeleteAccount: built.DeleteAccount({}),
  Box: Box({ children: text }),
  Row: Row({ children: text }),
  Column: Column({ children: text }),
  Text: text,
}

describe('text forms', () => {
  it('has a sample of every registered block', () => {
    expect(Object.keys(samples).sort()).toEqual(Object.keys(blockSpecs).sort())
  })

  it.each(Object.entries(samples))('renders %s to Markdown', (_, node) => {
    expect(renderText(node)).not.toBe('')
  })

  it('links a data block to the list its filter finds', () => {
    expect(renderText(samples.RecordRow!)).toBe("### [tasks](/tasks?filter=state+%3D+%27open%27)")
    expect(renderText(samples.Stat!)).toBe("**[Open](/tasks?filter=state+%3D+%27open%27)**")
  })

  it('heads a page, its tabs and its cards by level', () => {
    expect(renderText(built.Page({ title: 'Home', description: 'All of it', children: built.Tabs({ children: built.Tab({ name: 'a', label: 'A', children: samples.Card! }) }) }))).toBe(
      '# Home\n\nAll of it\n\n## A\n\n### Totals\n\nInside',
    )
  })

  it('puts a block’s actions under its heading', () => {
    const card = built.Card({ title: 'Totals', actions: [built.Action({ name: 'approve', label: 'Approve' })], children: text })
    expect(renderText(card)).toBe('### Totals\n\nApprove\n\nInside')
  })
})
