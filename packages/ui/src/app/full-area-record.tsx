import type { ReactElement, ReactNode } from 'react'
import { usePageScroll } from '../app-shell'
import { CustomBoundary } from './pages/custom-boundary'
import { useProjectUi } from './pages/project-ui'
import { RecordScope, type LayoutRecord } from './pages/record-scope'

/**
 * A record page that is a component of the app's own (`.record({ component })`), with the record around it as
 * `useLayoutRecord()` gives it. It fills the content area, which does not scroll while it shows; `standard`, the
 * record's standard page, shows instead while the component is missing or when it throws.
 */
export const FullAreaRecord = ({ component, scope, standard }: { component: string; scope: LayoutRecord; standard: ReactElement }) => {
  const { components } = useProjectUi()
  const Component = components?.[component]
  if (!Component) return standard
  return (
    <CustomBoundary name={component} fallback={standard}>
      <FullArea>
        <RecordScope value={scope}>
          <Component />
        </RecordScope>
      </FullArea>
    </CustomBoundary>
  )
}

// Inside the boundary, so a component that throws takes the page's scrolling back with it. The one grid cell stretches
// the component to the area's width and height.
const FullArea = ({ children }: { children: ReactNode }) => {
  usePageScroll(false)
  return <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">{children}</div>
}
