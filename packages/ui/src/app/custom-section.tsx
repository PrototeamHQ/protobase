import { unmarkFieldRefs, type CustomSectionModel } from '@protobase/schema'
import { Section, SidebarCard } from '../record-view'
import { CustomBoundary } from './pages/custom-boundary'
import { Problem } from './pages/problem'
import { useProjectUi } from './pages/project-ui'
import { RecordScope, type LayoutRecord } from './pages/record-scope'

/**
 * A component of the record layout (`l.custom`), drawn with the record around it, so `useLayoutRecord()` gives it, in a
 * section or a sidebar card under its title when it has one. The record page around it stays the framework's.
 */
export const CustomSection = ({ item, scope }: { item: CustomSectionModel; scope: LayoutRecord }) => {
  const { components } = useProjectUi()
  const Component = components?.[item.component]
  const body = Component ? (
    <RecordScope value={scope}>
      <CustomBoundary name={item.component}>
        <Component {...unmarkFieldRefs(item.props ?? {})} />
      </CustomBoundary>
    </RecordScope>
  ) : (
    <Problem>No component is registered as {item.component}. Export it from protobase.ui.tsx, or load the plugin that provides it.</Problem>
  )
  if (item.sidebar) return item.title ? <SidebarCard title={item.title}>{body}</SidebarCard> : body
  return item.title ? <Section title={item.title}>{body}</Section> : <section className="py-8">{body}</section>
}
