import { Plus, X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { builtInFieldTypes } from '@protobase/schema/internal'
import { Button } from '../../../primitives/button'
import { CodeBlock } from '../../../primitives/code-block'
import { FieldControlContext } from '../../../primitives/field-control'
import { Input } from '../../../primitives/input'
import { Textarea } from '../../../primitives/textarea'
import { TruncatedText } from '../../../data-grid/truncated-text'
import type { FieldWidget, FieldWidgetEditorProps, FieldWidgetProps } from '../field-widget'
import { commandOf, containerOf, storedContainer, type Container } from './container'
import { text } from './messages'

const Part = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <div className="grid gap-1">
    <h5 className="text-xs font-medium text-muted-foreground">{title}</h5>
    {children}
  </div>
)

// The Dockerfile, each file by its path, and the command, each written out as code.
const ContainerDisplay = ({ value }: FieldWidgetProps) => {
  if (value === null) return <span className="text-muted-foreground">—</span>
  const container = containerOf(value)
  return (
    <div className="grid gap-3">
      <Part title={text('dockerfile')}>
        <CodeBlock>{container.dockerfile}</CodeBlock>
      </Part>
      {container.files.map(([path, body]) => (
        <Part key={path} title={<span className="font-mono">{path}</span>}>
          <CodeBlock>{body}</CodeBlock>
        </Part>
      ))}
      <Part title={text('command')}>{container.command.length > 0 ? <CodeBlock>{JSON.stringify(container.command)}</CodeBlock> : <p className="text-body text-muted-foreground">{text('ownCommand')}</p>}</Part>
    </div>
  )
}

const ContainerCell = ({ value }: FieldWidgetProps) => {
  if (value === null) return null
  const container = containerOf(value)
  return <TruncatedText text={text('summary', { files: container.files.length, line: container.dockerfile.split('\n')[0] ?? '' })} />
}

// The Dockerfile takes the field's own label; each file's path and text and the command are labelled on their own. The
// files and the command are held as typed, so a file without a path yet, or an empty line of the command, stays; a
// value from elsewhere, as the record loads, replaces them.
const ContainerEditor = ({ value, onChange, invalid }: FieldWidgetEditorProps) => {
  const stored = containerOf(value)
  const seen = JSON.stringify(value ?? null)
  const [held, setHeld] = useState(() => ({ seen, files: stored.files, command: stored.command.join('\n') }))
  if (held.seen !== seen) setHeld({ seen, files: stored.files, command: stored.command.join('\n') })
  const { files, command } = held
  const id = useId()
  const save = (next: { files?: Container['files']; command?: string; dockerfile?: string }) => {
    const kept = { files: next.files ?? files, command: next.command ?? command }
    const container = storedContainer({ dockerfile: next.dockerfile ?? stored.dockerfile, files: kept.files, command: commandOf(kept.command) })
    setHeld({ seen: JSON.stringify(container), ...kept })
    onChange(container)
  }
  const changeFiles = (next: Container['files']) => save({ files: next })
  const named = (path: string, index: number) => path || text('fileNumber', { number: index + 1 })
  return (
    <div className="grid gap-3">
      <Textarea value={stored.dockerfile} rows={6} invalid={invalid} className="font-mono text-xs" spellCheck={false} onChange={(event) => save({ dockerfile: event.target.value })} />
      <FieldControlContext.Provider value={undefined}>
        {files.map(([path, body], index) => (
          <div key={index} className="grid gap-1.5 rounded-md border p-2" role="group" aria-label={named(path, index)}>
            <div className="flex items-center gap-2">
              <Input value={path} aria-label={text('path')} placeholder={text('pathExample')} className="font-mono" spellCheck={false} wrapperClassName="flex-1" onChange={(event) => changeFiles(files.map((file, at) => (at === index ? [event.target.value, body] : file)))} />
              <Button type="button" size="icon" variant="ghost" aria-label={text('removeFile', { path: named(path, index) })} onClick={() => changeFiles(files.filter((_, at) => at !== index))}>
                <X className="size-4" />
              </Button>
            </div>
            <Textarea value={body} rows={4} aria-label={text('fileText', { path: named(path, index) })} className="font-mono text-xs" spellCheck={false} onChange={(event) => changeFiles(files.map((file, at) => (at === index ? [path, event.target.value] : file)))} />
          </div>
        ))}
        <Button type="button" size="sm" className="justify-self-start" onClick={() => changeFiles([...files, ['', '']])}>
          <Plus className="size-4" />
          {text('addFile')}
        </Button>
        <div className="grid gap-1">
          <label htmlFor={`${id}-command`} className="text-xs font-medium text-muted-foreground">
            {text('commandLines')}
          </label>
          <Textarea
            id={`${id}-command`}
            value={command}
            rows={2}
            className="font-mono text-xs"
            spellCheck={false}
            onChange={(event) => save({ command: event.target.value })}
          />
        </div>
      </FieldControlContext.Provider>
    </div>
  )
}

/**
 * The built-in `custom_step_container` field type, for a custom step's `{ dockerfile, files, command }`, as the
 * `workflow_custom_steps` resource shows its own: `r.container.widget('custom_step_container')`. It shows the Dockerfile,
 * each file by its path and the command as code, and edits each in a box of its own, files added and removed by path and
 * the command one argument a line. See the workflows reference.
 */
export const customStepContainerField: FieldWidget = { of: [...builtInFieldTypes.custom_step_container], display: ContainerDisplay, editor: ContainerEditor, cell: ContainerCell, wide: true }
