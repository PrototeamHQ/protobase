import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { Composer } from './composer'

const meta = { title: 'Components/Chat/Composer', parameters: { layout: 'centered' }, decorators: [(Story) => <div className="flex h-[480px] w-[380px] flex-col border border-border bg-surface"><div className="mt-auto p-3"><Story /></div></div>] } satisfies Meta
export default meta

const people = [
  { id: 'ann', name: 'Ann de Vries' },
  { id: 'bo', name: 'Bo Jansen' },
  { id: 'vera', name: 'Vera Vrij' },
]
const searchPeople = fn(async (query: string) => people.filter((person) => person.name.toLowerCase().includes(query.toLowerCase())))
const send = fn()

/** `@` lists the people the search finds; Enter picks one, Shift+Enter starts a line, and Enter sends with the mentions. */
export const Mentions: StoryObj = {
  tags: ['play'],
  render: () => <Composer placeholder="Message #general" onSend={send} searchPeople={searchPeople} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('combobox', { name: 'Message' })
    await userEvent.type(box, 'Thanks @vr')
    const list = await canvas.findByRole('listbox', { name: 'People to mention' })
    await waitFor(() => expect(within(list).getAllByRole('option').map((option) => option.textContent)).toEqual(['Ann de Vries', 'Vera Vrij']))
    expect(searchPeople).toHaveBeenLastCalledWith('vr')
    // The list opens above the box, which sits at the bottom of a chat
    expect(list.getBoundingClientRect().bottom).toBeLessThanOrEqual(box.getBoundingClientRect().top)
    await userEvent.keyboard('{Enter}')
    expect(box).toHaveValue('Thanks @Ann de Vries ')
    expect(send).not.toHaveBeenCalled()

    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    await userEvent.type(box, 'see you at 10  ')
    expect(box).toHaveValue('Thanks @Ann de Vries \nsee you at 10  ')
    await userEvent.keyboard('{Enter}')
    expect(send).toHaveBeenCalledWith('Thanks @Ann de Vries \nsee you at 10', ['ann'])
    expect(box).toHaveValue('')
  },
}

/** A mention whose name was edited away is no mention, and a failed search says so. */
export const MentionsEditedAway: StoryObj = {
  tags: ['play'],
  render: () => <Composer onSend={send} searchPeople={(query) => (query === 'x' ? Promise.reject(new Error('offline')) : searchPeople(query))} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('combobox', { name: 'Message' })
    await userEvent.type(box, '@bo')
    await canvas.findByRole('option', { name: 'Bo Jansen' })
    await userEvent.keyboard('{Tab}')
    expect(box).toHaveValue('@Bo Jansen ')
    await userEvent.type(box, '{Backspace}{Backspace}{Backspace}hi @x')
    expect(await canvas.findByText('Could not search for people')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(canvas.queryByRole('listbox')).toBeNull()
    await userEvent.keyboard('{Enter}')
    expect(send).toHaveBeenLastCalledWith('@Bo Janshi @x', [])
  },
}
