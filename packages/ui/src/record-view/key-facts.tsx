import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type KeyFact = {
  label: string
  value: ReactNode
  /** Drawn above the value in place of the label, which screen readers and the tooltip still give. */
  icon?: LucideIcon
}

/**
 * A record's key facts side by side, as the bedrooms, area and energy label of a listing on a real estate site: each
 * value under its icon, or under its label without one, wrapping onto more rows as needed, two to a row on a mobile
 * screen.
 */
export const KeyFacts = ({ facts }: { facts: KeyFact[] }) => (
  <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:flex sm:flex-wrap sm:gap-x-10">
    {facts.map(({ label, value, icon: Icon }) => (
      <div key={label} title={label} className="flex min-w-0 flex-col gap-1.5">
        <dt className="text-muted-foreground">
          {Icon ? (
            <>
              <Icon className="size-5" aria-hidden />
              <span className="sr-only">{label}</span>
            </>
          ) : (
            label
          )}
        </dt>
        <dd className="min-w-0 break-words text-[16px] font-semibold text-foreground">{value}</dd>
      </div>
    ))}
  </dl>
)
