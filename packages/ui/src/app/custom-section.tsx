import type { ReactNode } from 'react'
import type { CustomSectionModel } from '@protobase/schema'
import { unmarkFieldRefs } from '@protobase/schema/internal'
import { Section, SidebarCard } from '../record-view'
import { CustomOrFallback } from './pages/custom-or-fallback'
import { useProjectUi } from './pages/project-ui'
import { RecordScope, type LayoutRecord } from './pages/record-scope'

// A section or a sidebar card under the item's title when it has one
const frame = (item: CustomSectionModel, body: ReactNode) => {
  if (item.sidebar) return item.title ? <SidebarCard title={item.title}>{body}</SidebarCard> : body
  return item.title ? <Section title={item.title}>{body}</Section> : <section className="py-8">{body}</section>
}

/**
 * A component of the record layout (`l.custom`), drawn with the record around it, so `useLayoutRecord()` gives it, in a
 * section or a sidebar card under its title when it has one. The record page around it stays the framework's. When the
 * component is missing or throws, `fallback`, the item's fallback as the page draws it, takes its place, title included.
 */
export const CustomSection = ({ item, scope, fallback }: { item: CustomSectionModel; scope: LayoutRecord; fallback: ReactNode | undefined }) => {
  const { components } = useProjectUi()
  const Component = components?.[item.component]
  const body = Component && (
    <RecordScope value={scope}>
      <Component {...unmarkFieldRefs(item.props ?? {})} />
    </RecordScope>
  )
  // Without a fallback the warning stands in the frame, where the component would
  if (fallback === undefined) {
    return frame(
      item,
      <CustomOrFallback name={item.component} registered={Boolean(Component)} fallback={undefined}>
        {body}
      </CustomOrFallback>,
    )
  }
  return (
    <CustomOrFallback name={item.component} registered={Boolean(Component)} fallback={fallback}>
      {frame(item, body)}
    </CustomOrFallback>
  )
}
