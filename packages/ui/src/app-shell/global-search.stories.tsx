import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import type { GlobalSearchModel, SearchResultGroup } from './global-search'
import { TopBar } from './top-bar'

const meta = { title: 'Shell/Global search', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const records: Record<string, Array<[title: string, subtitle?: string]>> = {
  Organizations: [['Acme Analytics', 'Amsterdam'], ['Initech', 'Austin'], ['Globex Logistics', 'Rotterdam']],
  Services: [['acme-web', 'Acme Analytics'], ['acme-worker', 'Acme Analytics'], ['initech-api', 'Initech'], ['globex-tracking', 'Globex Logistics']],
  Invoices: [['INV-ACME-0007'], ['INV-INITECH-0001']],
}

/** A top bar whose search looks through a few names at once, as the app does through the API. */
const Searchable = ({ failing }: { failing?: string }) => {
  const [text, setText] = useState('')
  const [opened, setOpened] = useState('nothing yet')
  const query = text.trim().length >= 2 ? text.trim() : ''
  const groups: SearchResultGroup[] = Object.entries(records).flatMap(([label, names]) => {
    if (!query) return []
    if (label === failing) return [{ id: label, label, hits: [], failed: true }]
    const hits = names.filter(([name]) => name.toLowerCase().includes(query.toLowerCase())).map(([name, subtitle]) => ({ id: name, title: name, subtitle, href: `/${label.toLowerCase()}/${name}` }))
    return hits.length > 0 ? [{ id: label, label, hits }] : []
  })
  const search: GlobalSearchModel = { placeholder: 'Search organizations, services and more', text, onTextChange: setText, query, loading: false, groups, onSelect: setOpened }
  return (
    <div className="h-80">
      <TopBar breadcrumb={['Control panel', 'Overview']} search={search} />
      <p className="p-5 text-[13px]">
        Opened: <output aria-label="Opened">{opened}</output>
      </p>
    </div>
  )
}

export const Results: StoryObj = { render: () => <Searchable /> }

export const Keyboard: StoryObj = {
  tags: ['play'],
  render: () => <Searchable />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('combobox', { name: 'Global search' })
    expect(box).toHaveAttribute('placeholder', 'Search organizations, services and more')
    await userEvent.keyboard('{Meta>}k{/Meta}')
    expect(box).toHaveFocus()
    await userEvent.type(box, 'acme')
    const list = await canvas.findByRole('listbox', { name: 'Search results' })
    expect(within(list).getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual(['Organizations', 'Services', 'Invoices'])
    expect(within(list).getAllByRole('option').map(lines)).toEqual([['Acme Analytics', 'Amsterdam'], ['acme-web', 'Acme Analytics'], ['acme-worker', 'Acme Analytics'], ['INV-ACME-0007']])
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}')
    const chosen = within(list).getByRole('option', { name: /^acme-web/ })
    expect(chosen).toHaveAttribute('aria-selected', 'true')
    expect(box).toHaveAttribute('aria-activedescendant', chosen.id)
    await userEvent.keyboard('{Enter}')
    expect(canvas.getByRole('status', { name: 'Opened' })).toHaveTextContent('/services/acme-web')
    expect(box).toHaveValue('acme')
    expect(box).not.toHaveFocus()
    expect(canvas.queryByRole('listbox')).toBeNull()
    await userEvent.click(box)
    expect(within(await canvas.findByRole('listbox', { name: 'Search results' })).getAllByRole('option')).toHaveLength(4)
  },
}

/** Each line of a result: the bold title, then the subtitle when there is one. */
const lines = (option: HTMLElement) => [...option.children].map((line) => line.textContent)

export const Links: StoryObj = {
  tags: ['play'],
  render: () => <Searchable />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('combobox', { name: 'Global search' })
    await userEvent.type(box, 'initech')
    const option = await canvas.findByRole('option', { name: /^Initech/ })
    expect(option.tagName).toBe('A')
    expect(option).toHaveAttribute('href', '/organizations/Initech')
    // A Cmd or Ctrl click is the browser's: a new tab, with the list still open here
    let left = false
    document.addEventListener('click', (event) => { left = !event.defaultPrevented; event.preventDefault() }, { once: true })
    const user = userEvent.setup()
    await user.keyboard('{Meta>}')
    await user.click(option)
    await user.keyboard('{/Meta}')
    expect(left).toBe(true)
    expect(canvas.getByRole('status', { name: 'Opened' })).toHaveTextContent('nothing yet')
    expect(canvas.getByRole('listbox', { name: 'Search results' })).toBeVisible()
    // A plain click opens it here and closes the list, keeping the text
    await userEvent.click(option)
    expect(canvas.getByRole('status', { name: 'Opened' })).toHaveTextContent('/organizations/Initech')
    expect(canvas.queryByRole('listbox')).toBeNull()
    expect(box).toHaveValue('initech')
  },
}

export const ClearButton: StoryObj = {
  tags: ['play'],
  render: () => <Searchable />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('combobox', { name: 'Global search' })
    expect(canvas.getByText('⌘K')).toBeVisible()
    expect(canvas.queryByRole('button', { name: 'Clear search' })).toBeNull()
    await userEvent.type(box, 'acme')
    expect(canvas.queryByText('⌘K')).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Clear search' }))
    expect(box).toHaveValue('')
    expect(box).toHaveFocus()
    expect(canvas.queryByRole('listbox')).toBeNull()
    expect(canvas.getByText('⌘K')).toBeVisible()
  },
}

export const NothingFound: StoryObj = {
  tags: ['play'],
  render: () => <Searchable />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('combobox', { name: 'Global search' })
    await userEvent.type(box, 'umbrella')
    expect(await canvas.findByText('No matches for “umbrella”')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    expect(box).toHaveValue('')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(box).not.toHaveFocus())
  },
}

export const OneResourceFails: StoryObj = {
  tags: ['play'],
  render: () => <Searchable failing="Services" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('combobox', { name: 'Global search' }), 'initech')
    expect(await canvas.findByText('Could not search services')).toBeVisible()
    await userEvent.click(canvas.getByRole('option', { name: /^Initech/ }))
    expect(canvas.getByRole('status', { name: 'Opened' })).toHaveTextContent('/organizations/Initech')
  },
}
