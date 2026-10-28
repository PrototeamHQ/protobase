import type { Meta, StoryObj } from '@storybook/react-vite'
import { Paperclip } from 'lucide-react'
import { useRef, useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { Button } from '../primitives/button'
import { Token } from '../primitives/token'
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

const sendWithFiles = fn()

/** A composer whose message carries files: an attach button and a tray of the picked files in its slots. */
const WithFiles = () => {
  const [files, setFiles] = useState<File[]>([])
  const picker = useRef<HTMLInputElement>(null)
  const add = (added: File[]) => setFiles((current) => [...current, ...added])
  const attach = (
    <>
      <input ref={picker} type="file" multiple hidden aria-label="Files to attach" onChange={(event) => add([...(event.target.files ?? [])])} />
      <Button type="button" variant="ghost" size="icon" aria-label="Attach files" onClick={() => picker.current?.click()}>
        <Paperclip className="size-4" />
      </Button>
    </>
  )
  const tray = files.length > 0 && (
    <ul aria-label="Files to send" className="flex flex-wrap gap-1">
      {files.map((file, index) => (
        <li key={index} className="max-w-full">
          <Token label={file.name} onRemove={() => setFiles((current) => current.filter((_, at) => at !== index))} />
        </li>
      ))}
    </ul>
  )
  return (
    <Composer
      placeholder="Message #general"
      actions={attach}
      attachments={tray}
      canSendEmpty={files.length > 0}
      onFiles={add}
      onSend={(message, mentions) => {
        sendWithFiles(message, mentions, files.map((file) => file.name))
        setFiles([])
      }}
    />
  )
}

const transferOf = (...files: File[]) => {
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  return transfer
}

/** Picked, pasted and dropped files land in the tray; with files the message sends without text, and pasted text stays text. */
export const Attachments: StoryObj = {
  tags: ['play'],
  render: () => <WithFiles />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Without people to search, the box is a plain text box
    const box = canvas.getByRole('textbox', { name: 'Message' })
    const sendButton = canvas.getByRole('button', { name: 'Send' })
    expect(sendButton).toBeDisabled()

    await userEvent.upload(canvas.getByLabelText('Files to attach'), new File(['a'], 'notes.txt', { type: 'text/plain' }))
    box.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transferOf(new File(['b'], 'shot.png', { type: 'image/png' })) }))
    box.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transferOf(new File(['c'], 'plan.pdf', { type: 'application/pdf' })) }))
    const tray = await canvas.findByRole('list', { name: 'Files to send' })
    await waitFor(() => expect(within(tray).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['notes.txt', 'shot.png', 'plan.pdf']))
    expect(box).toHaveValue('')

    // Text pasted into the box stays text and goes to no tray
    await userEvent.click(box)
    await userEvent.paste('see attached')
    expect(box).toHaveValue('see attached')
    await userEvent.clear(box)

    expect(sendButton).toBeEnabled()
    await userEvent.click(box)
    await userEvent.keyboard('{Enter}')
    expect(sendWithFiles).toHaveBeenCalledWith('', [], ['notes.txt', 'shot.png', 'plan.pdf'])
    expect(canvas.queryByRole('list', { name: 'Files to send' })).toBeNull()
    expect(sendButton).toBeDisabled()
  },
}
