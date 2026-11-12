import { Checkbox } from '../../../primitives/checkbox'
import { text } from '../messages'

type ChecklistInputProps = { boxes: string[]; ticked: string[]; onChange: (ticked: string[]) => void }

/** A checklist's boxes, each ticked by its checkbox or its text, or a line saying there is nothing to tick. */
export const ChecklistInput = ({ boxes, ticked, onChange }: ChecklistInputProps) => {
  if (boxes.length === 0) return <p className="text-sm text-muted-foreground">{text('nothingToTick')}</p>
  const toggle = (box: string, on: boolean) => onChange(on ? [...ticked, box] : ticked.filter((entry) => entry !== box))
  return (
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
  )
}
