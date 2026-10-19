import { useState } from 'react'
import { Segmented } from '../primitives/segmented'
import { Textarea } from '../primitives/textarea'
import { Markdown } from './markdown'
import { text } from './messages'

type Mode = 'write' | 'preview'

const modes = () => [
  { value: 'write' as const, label: text('write') },
  { value: 'preview' as const, label: text('preview') },
]

export type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  /** What the switch between writing and the preview is called, such as the field's label. */
  label: string
  invalid?: boolean
  placeholder?: string
}

/**
 * Markdown source in a box that grows with it, as GitHub edits a comment, and a switch to its rendered preview: the
 * text is stored exactly as typed.
 */
export const MarkdownEditor = ({ value, onChange, label, invalid, placeholder }: MarkdownEditorProps) => {
  const [mode, setMode] = useState<Mode>('write')
  return (
    <div className="flex flex-col gap-1.5">
      <span className="self-start">
        <Segmented value={mode} options={modes()} onChange={setMode} label={label} />
      </span>
      {mode === 'write' ? (
        <Textarea rows={5} invalid={invalid} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <div className="min-h-[7.5rem] rounded-md border border-border px-2.5 py-1.5">
          {value.trim() === '' ? <span className="text-faint-foreground">{text('nothingToPreview')}</span> : <Markdown source={value} />}
        </div>
      )}
    </div>
  )
}
