import { Button } from '../../primitives/button'
import { text } from './messages'

/** A save conflict's choices: each settles one field, so each names the field it settles. */
export const ConflictChoices = ({ fields, onKeepMine, onUseTheirs }: { fields: { name: string; label: string }[]; onKeepMine: (name: string) => void; onUseTheirs: (name: string) => void }) => (
  <>
    {fields.map(({ name, label }) => [
      <Button key={`mine:${name}`} size="sm" onClick={() => onKeepMine(name)}>{text('keepMine', { field: label })}</Button>,
      <Button key={`theirs:${name}`} size="sm" onClick={() => onUseTheirs(name)}>{text('useTheirs', { field: label })}</Button>,
    ])}
  </>
)
