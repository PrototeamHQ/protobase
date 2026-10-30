import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import type { AppAddress } from '@protobase/schema'
import { buttonClass } from '../../primitives/button'
import { segmentedClass } from '../../primitives/segmented'
import { AppLink } from '../use-app-address'
import { text } from './messages'

/** One choice of the scale switch: the period it opens, and whether it is the scale shown. */
export type ScaleChoice<V> = { view: V; label: string; current: boolean }

type PeriodControlsProps<V> = {
  /** The period shown, as its heading says it. */
  heading: string
  /** What one step is, for the step buttons' labels. */
  unit: 'week' | 'month' | 'quarter'
  previous: V
  today: V
  next: V
  scales: ScaleChoice<V>[]
  /** The scale switch's name for assistive technology. */
  scalesLabel: string
  /** The address that shows the display at a period: the controls are links to it. */
  linkTo?: (view: V) => AppAddress
  /** Shows the display at a period, for one without an address of its own: the controls are buttons. */
  onView?: (view: V) => void
}

/**
 * The period a calendar or a timeline shows, with the way to the one before, the one holding today, the one after, and
 * its scales: links when the period is in the address, so each opens in a new tab, else buttons.
 */
export const PeriodControls = <V,>({ heading, unit, previous, today, next, scales, scalesLabel, linkTo, onView }: PeriodControlsProps<V>) => {
  const control = (to: V, className: string, label: string, children: ReactNode, current?: boolean) =>
    linkTo ? (
      <AppLink to={linkTo(to)} className={className} aria-label={label} aria-current={current ? 'page' : undefined}>
        {children}
      </AppLink>
    ) : (
      <button type="button" className={className} aria-label={label} aria-pressed={current} onClick={() => onView?.(to)}>
        {children}
      </button>
    )
  const square = buttonClass({ variant: 'secondary', size: 'sm' })
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-medium">{heading}</h2>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {control(previous, square, text('previousPeriod', { unit }), <ChevronLeft className="size-3.5" />)}
          {control(today, square, text('today'), text('today'))}
          {control(next, square, text('nextPeriod', { unit }), <ChevronRight className="size-3.5" />)}
        </div>
        <span role="group" aria-label={scalesLabel} className={segmentedClass.group()}>
          {scales.map((scale) => (
            <Fragment key={scale.label}>{control(scale.view, segmentedClass.option(scale.current), scale.label, scale.label, scale.current)}</Fragment>
          ))}
        </span>
      </div>
    </div>
  )
}
