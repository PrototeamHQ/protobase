import type { ReactNode } from 'react'
import { CustomBoundary } from './custom-boundary'
import { Problem } from './problem'
import { text } from './messages'

/** What stands in for a custom component the app cannot draw: its fallback, under the warning in development, or the warning alone without one. */
const Replacement = ({ problem, fallback }: { problem: ReactNode; fallback: ReactNode | undefined }) => {
  if (fallback === undefined) return <Problem>{problem}</Problem>
  return (
    <>
      {import.meta.env?.DEV && <Problem>{problem}</Problem>}
      {fallback}
    </>
  )
}

type CustomOrFallbackProps = {
  /** The component's registered name. */
  name: string
  /** Whether the app has a component registered under `name`. */
  registered: boolean
  /** The fallback the layout declares, drawn when the component is missing or throws; `undefined` when it declares none. */
  fallback: ReactNode | undefined
  /** The component, drawn when it is registered. */
  children: ReactNode
}

/** A project's or plugin's layout component, or, when it is missing or throws, the fallback its layout declares. */
export const CustomOrFallback = ({ name, registered, fallback, children }: CustomOrFallbackProps) => {
  if (!registered) return <Replacement problem={text.rich('noComponent', { component: name })} fallback={fallback} />
  return (
    <CustomBoundary name={name} fallback={fallback === undefined ? undefined : <Replacement problem={text.rich('couldNotDraw', { name })} fallback={fallback} />}>
      {children}
    </CustomBoundary>
  )
}
