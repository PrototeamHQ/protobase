import type { CustomSectionModel } from '@protobase/schema'
import { unmarkFieldRefs } from '@protobase/schema/internal'
import { Section, SidebarCard } from '../record-view'
import { CustomBoundary } from './pages/custom-boundary'
import { Problem } from './pages/problem'
import { useProjectUi } from './pages/project-ui'
import { RecordScope, type LayoutRecord } from './pages/record-scope'
import { text as appText } from './messages'
import { slotted } from '../locale/slotted'

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
    <Problem>{slotted(appText('noComponent'), item.component)}</Problem>
  )
  if (item.sidebar) return item.title ? <SidebarCard title={item.title}>{body}</SidebarCard> : body
  return item.title ? <Section title={item.title}>{body}</Section> : <section className="py-8">{body}</section>
}
