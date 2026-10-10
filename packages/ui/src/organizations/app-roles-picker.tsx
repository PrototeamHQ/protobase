import type { RoleLabel } from '@protobase/client'
import { Checkbox } from '../primitives/checkbox'
import { cn } from '../lib/cn'

export type AppRolesPickerProps = {
  roles: readonly RoleLabel[]
  selected: readonly string[]
  /** The roles the person may give or take away; the others show as they are. */
  grantable: ReadonlySet<string>
  disabled?: boolean
  onChange: (selected: string[]) => void
}

/** The app roles a member can hold, ticked when held; only those the person may give or take away can change. */
export const AppRolesPicker = ({ roles, selected, grantable, disabled, onChange }: AppRolesPickerProps) => (
  <div className="flex flex-wrap gap-x-4 gap-y-2">
    {roles
      .filter((role) => role.membership)
      .map((role) => {
        const held = selected.includes(role.name)
        const locked = disabled || !grantable.has(role.name)
        return (
          <label key={role.name} title={locked && !disabled ? 'You cannot give or take away this role' : undefined} className={cn('inline-flex items-center gap-1.5 text-[13px]', locked && 'text-muted-foreground')}>
            <Checkbox
              checked={held}
              label={role.label}
              onChange={locked ? undefined : (checked) => onChange(checked ? [...selected, role.name] : selected.filter((name) => name !== role.name))}
              className={cn(locked && 'cursor-default opacity-60')}
            />
            {role.label}
          </label>
        )
      })}
  </div>
)
