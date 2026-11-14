import type { SelectInputProps } from '@protobase/layout'
import { cn } from '../../../lib/cn'
import { MenuSelect } from '../../../primitives/menu-select'
import { usePageParams } from '../page-params'
import { propsOf, type BlockProps } from './block-props'

/**
 * The page parameter `source` under its label, as react-admin's SelectInput draws a choice: a select whose every choice
 * is a link to the page with it chosen, its default leaving the parameter out. Without choices, the value the address
 * gives, as text.
 */
export const SelectInputBlock = ({ node, className }: BlockProps) => {
  const { source, choices, label = source, defaultValue } = propsOf<SelectInputProps>(node)
  const { values, linkTo } = usePageParams()
  const value = values[source]
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="font-medium text-muted-foreground">{label}</span>
      {choices ? (
        <MenuSelect
          label={label}
          value={value ?? ''}
          options={choices.map((choice) => ({ value: String(choice.id), label: choice.name }))}
          link={(id) => linkTo({ [source]: defaultValue !== undefined && id === String(defaultValue) ? undefined : id })}
        />
      ) : (
        <span>{value}</span>
      )}
    </div>
  )
}
