import { dateFieldText } from './field-format'
import type { DateFieldProps } from './inline-fields'
import type { LayoutNode, LayoutValue } from './node'

// Props of the field components that react-admin checks as they draw, checked here as the layout loads instead.

// Whether Intl takes the locales and options, which it refuses with a RangeError or a TypeError
const intlProblem = (format: (locales: string | string[] | undefined, options: Record<string, LayoutValue> | undefined) => unknown, props: Record<string, LayoutValue>): string[] => {
  try {
    format(props.locales as string | string[] | undefined, props.options as Record<string, LayoutValue> | undefined)
    return []
  } catch (error) {
    // The error's own text depends on the runtime, so the problem says what it means
    if (error instanceof RangeError || error instanceof TypeError) return ['"locales" or "options" holds a locale or an option Intl does not take, or a value it does not take for one']
    throw error
  }
}

/** Problems of a `NumberField`'s or `DateField`'s locales and options, and of a `DateField` that would show nothing. */
export const inlineFieldProblems = ({ type, props }: LayoutNode): string[] => {
  if (type === 'NumberField') return intlProblem((locales, options) => new Intl.NumberFormat(locales, options as Intl.NumberFormatOptions), props)
  if (type !== 'DateField') return []
  if (props.showDate === false && props.showTime !== true) return ['cannot have showTime and showDate false at the same time']
  if (props.format === 'relative' && ['showDate', 'showTime', 'locales', 'options'].some((name) => props[name] !== undefined)) return ['format="relative" takes no showDate, showTime, locales or options: it reads in the reader\'s own words']
  // Through the formatter the component draws with: a date-only one refuses timeStyle, a time-only one dateStyle
  return intlProblem(() => dateFieldText(0, props as DateFieldProps, { now: 0, relative: String }), props)
}
