import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { createStaticSession } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { App } from '../app'
import { defineUi } from '../pages/project-ui'
import { fakeApi } from '../testing/fake-api'
import type { BoardDropWrite } from './board-drop'

const meta = { title: 'List page/Board drop', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const session = createStaticSession('story-token', { id: 'pip', email: 'pip@bikeshop.example', name: 'Pip', role: 'admin' })

// A quote's status is the database's, from its latest decision that was not withdrawn; a blocked quote stays in review
const quotes = resource('quotes')
  .table('quotes')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    title: f.text(),
    blocked: f.boolean(),
    status: f.enum(['review', 'approved', 'rejected', 'sent']).readOnly().filterable().sortable(),
  })
  .primaryKey((r) => r.id)

const decisions = resource('decisions')
  .table('decisions')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    quote_id: f.integer().filterable(),
    verdict: f.enum(['reopen', 'approve', 'reject']),
    withdrawn: f.boolean(),
  })
  .primaryKey((r) => r.id)

const quotesView = view<typeof quotes>('quotes')
  .title((r) => r.title)
  .fields((r) => ({ status: r.status.valueColors({ sent: 'blue' }) }))
  .list((r, d) => ({ columns: [r.title, r.status], displays: [d.board({ by: r.status })], default: 'board', drag: { board: 'decide' } }))

type Row = Record<string, unknown>

const statusOf = (quote: Row, decided: Row[]) => {
  const latest = decided.filter((decision) => String(decision.quote_id) === String(quote.id) && !decision.withdrawn).at(-1)
  if (latest?.verdict === 'reject') return 'rejected'
  if (latest?.verdict === 'approve' && !quote.blocked) return 'approved'
  return 'review'
}

// What a database trigger would do: a decision written sets its quote's status again. The API gives integer keys as text
const afterWrite = (name: string, row: Row, rows: Record<string, Row[]>) => {
  if (name !== 'decisions') return
  const quote = rows.quotes!.find((entry) => String(entry.id) === String(row.quote_id))!
  quote.status = statusOf(quote, rows.decisions!)
  delete quote.etag
}

// A drop records a decision on the quote, which undo withdraws
const decide =
  (verdict: string): BoardDropWrite =>
  async ({ record, client }) => {
    const created = await client.create('decisions', { quote_id: record.id, verdict, withdrawn: false })
    return async () => {
      await client.update('decisions', created.record.id as number, { withdrawn: true }, created.etag)
    }
  }

const ui = defineUi({ boardDrops: { decide: { review: decide('reopen'), approved: decide('approve'), rejected: decide('reject') } } })

const Shop = () => {
  const [api] = useState(() =>
    fakeApi({
      resources: [quotes.toModel(), decisions.toModel()],
      views: [quotesView.toModel()],
      rows: {
        quotes: [
          { id: 1, title: 'Winter service for Emma', blocked: false, status: 'review' },
          { id: 2, title: 'New wheels for Sam', blocked: true, status: 'review' },
          { id: 3, title: 'Brake pads for Jo', blocked: false, status: 'rejected' },
          { id: 4, title: 'Frame repair for Lee', blocked: false, status: 'sent' },
        ],
        decisions: [{ id: 1, quote_id: 3, verdict: 'reject', withdrawn: false }],
      },
      afterWrite,
    }),
  )
  return (
    <div className="h-screen">
      <App client={api.client} auth={session} initialUrl="/quotes" ui={ui} workspace="Pip's bike shop" />
    </div>
  )
}

export const Quotes: StoryObj = { name: 'A board whose drops record a decision', render: () => <Shop /> }

const column = (canvas: ReturnType<typeof within>, name: string) => canvas.findByRole('region', { name: new RegExp(`^${name}, \\d+$`) })
const titles = (region: HTMLElement) => within(region).queryAllByRole('link').map((link) => link.firstElementChild?.firstElementChild?.textContent)
const announced = (text: string) => waitFor(() => expect(within(document.body).getByText(text, { exact: false, ignore: 'a, a *' })).toBeInTheDocument())

// Space picks the card up, each right arrow moves it a column, and Space drops it
const moveRight = async (card: HTMLElement, columns: string[]) => {
  card.focus()
  await userEvent.keyboard(' ')
  await announced('is over ')
  for (const name of columns) {
    await userEvent.keyboard('{ArrowRight}')
    await announced(`is over ${name}.`)
  }
  await userEvent.keyboard(' ')
}

export const QuotesChecks: StoryObj = {
  ...Quotes,
  name: 'A board whose drops record a decision, moved with the keyboard (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const review = await column(canvas, 'review')
    const approved = await column(canvas, 'approved')
    await waitFor(() => expect(titles(review)).toEqual(['Winter service for Emma', 'New wheels for Sam']))
    // The drop's write records the decision, and the card lands where its status now puts it
    await moveRight(within(review).getByRole('link', { name: /Winter service/ }), ['approved'])
    expect(await within(document.body).findByText('Moved to approved')).toBeInTheDocument()
    await waitFor(() => expect(titles(approved)).toEqual(['Winter service for Emma']))
    // Undo runs the undo the write gave, withdrawing the decision
    await userEvent.click(within(document.body).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(titles(review)).toEqual(['Winter service for Emma', 'New wheels for Sam']))
    // A blocked quote stays in review though approved
    await moveRight(within(review).getByRole('link', { name: /New wheels/ }), ['approved'])
    expect(await within(document.body).findByText('Saved, still in review')).toBeInTheDocument()
    await waitFor(() => expect(titles(review)).toEqual(['Winter service for Emma', 'New wheels for Sam']))
    // A column the drop does not list takes no card
    const rejected = await column(canvas, 'rejected')
    await moveRight(within(rejected).getByRole('link', { name: /Brake pads/ }), ['sent'])
    await announced('Brake pads for Jo was put back.')
    expect(titles(rejected)).toEqual(['Brake pads for Jo'])
    expect(titles(await column(canvas, 'sent'))).toEqual(['Frame repair for Lee'])
  },
}
