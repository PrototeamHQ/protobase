import { Switch } from '../primitives/switch'

export type ToggleRowProps = { label: string; checked: boolean; onChange: () => void }

export const ToggleRow = ({ label, checked, onChange }: ToggleRowProps) => (
  <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
    <span>{label}</span>
    <Switch checked={checked} onChange={onChange} label={label} />
  </label>
)
