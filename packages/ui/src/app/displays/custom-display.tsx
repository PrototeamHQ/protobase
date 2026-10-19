import type { ListDisplayModel } from '@protobase/schema'
import { unmarkFieldRefs } from '@protobase/schema/internal'
import { CustomBoundary } from '../pages/custom-boundary'
import { Problem } from '../pages/problem'
import { useProjectUi } from '../pages/project-ui'
import { ListDisplayProvider, type ListDisplay } from './display-context'

/**
 * A display the project draws: the component registered under its name gets the display's props, field references
 * as the names they reference, and reads the list page's rows with `useListDisplay()`.
 */
export const CustomDisplay = ({ display, list }: { display: Extract<ListDisplayModel, { kind: 'custom' }>; list: ListDisplay }) => {
  const { components } = useProjectUi()
  const Component = components?.[display.component]
  if (!Component) return <Problem>No component is registered as {display.component}. Export it from protobase.ui.tsx, or load the plugin that provides it.</Problem>
  return (
    <ListDisplayProvider value={list}>
      {/* As tall as what it draws, scrolling with the page; a wide one, such as a board, scrolls sideways; positioned, so what it places absolutely scrolls inside it instead of widening the page */}
      <div className="relative min-w-0 flex-1 overflow-x-auto">
        <CustomBoundary name={display.component}>
          <Component {...unmarkFieldRefs(display.props ?? {})} />
        </CustomBoundary>
      </div>
    </ListDisplayProvider>
  )
}
