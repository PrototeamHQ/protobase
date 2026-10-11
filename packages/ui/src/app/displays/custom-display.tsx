import { unmarkFieldRefs, type ListDisplayModel } from '@protobase/schema'
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
  if (!Component) return <Problem>No component is registered as {display.component}. Export it from protobase.ui.tsx.</Problem>
  return (
    <ListDisplayProvider value={list}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Component {...unmarkFieldRefs(display.props ?? {})} />
      </div>
    </ListDisplayProvider>
  )
}
