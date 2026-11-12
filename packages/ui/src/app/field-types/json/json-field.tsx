import { useState } from 'react'
import { builtInFieldTypes } from '@protobase/schema/internal'
import { Textarea } from '../../../primitives/textarea'
import type { FieldWidget, FieldWidgetEditorProps, FieldWidgetProps } from '../field-widget'
import { JsonBlock } from './json-block'
import { jsonSummary } from '../../../live/json-summary'
import { TruncatedText } from '../../../data-grid/truncated-text'
import { jsonOf, notJson } from './json-text'
import { text } from './messages'

const JsonDisplay = ({ value }: FieldWidgetProps) => (value === null ? <span className="text-muted-foreground">—</span> : <JsonBlock value={value} />)

const JsonCell = ({ value }: FieldWidgetProps) => <TruncatedText text={jsonSummary(value)} />

// The text stays as typed; the value changes each time it parses, and text that does not says so under the box.
const JsonEditor = ({ value, onChange, invalid }: FieldWidgetEditorProps) => {
  const [typed, setTyped] = useState<string>()
  const shown = typed ?? (value === null ? '' : JSON.stringify(value, null, 2))
  const broken = typed !== undefined && jsonOf(typed) === notJson
  return (
    <div className="grid gap-1">
      <Textarea
        value={shown}
        rows={3}
        invalid={invalid || broken}
        className="font-mono text-xs"
        onChange={(event) => {
          setTyped(event.target.value)
          const parsed = jsonOf(event.target.value)
          if (parsed !== notJson) onChange(parsed)
        }}
      />
      {broken && <p className="text-xs text-danger-text">{text('notJson')}</p>}
    </div>
  )
}

/**
 * The built-in `json` field type, for any JSON field a form edits as JSON text, such as a workflow run's input:
 * `r.input.widget('json')`. It shows the value written out on several lines. See the field types reference.
 */
export const jsonField: FieldWidget = { of: [...builtInFieldTypes.json], display: JsonDisplay, editor: JsonEditor, cell: JsonCell, wide: true }
