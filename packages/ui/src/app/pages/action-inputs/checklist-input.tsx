import { Checkbox } from '../../../primitives/checkbox'
import { useFieldControl } from '../../../primitives/field-control'
import { text } from '../messages'

type ChecklistInputProps = { label: string; boxes: string[]; ticked: string[]; onChange: (ticked: string[]) => void }

/**
 * A checklist's boxes, each ticked by its checkbox or its text, as a group named by its label and described by the help
 * and error of the `Field` around it; or a line saying there is nothing to tick.
 */
export const ChecklistInput = ({ label, boxes, ticked, onChange }: ChecklistInputProps) => {
  const { id, 'aria-describedby': describedBy, 'aria-invalid': invalid } = useFieldControl()
  if (boxes.length === 0) return <p className="text-sm text-muted-foreground">{text('nothingToTick')}</p>
  const toggle = (box: string, on: boolean) => onChange(on ? [...ticked, box] : ticked.filter((entry) => entry !== box))
  return (
    <div id={id} role="group" aria-label={label} aria-describedby={describedBy} aria-invalid={invalid}>
      <ul className="flex flex-col gap-1">
        {boxes.map((box) => (
          <li key={box}>
            <label className="flex cursor-pointer items-start gap-3 rounded py-1.5 text-sm active:opacity-70">
              <Checkbox checked={ticked.includes(box)} onChange={(on) => toggle(box, on)} className="mt-0.5" />
              <span>{box}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
