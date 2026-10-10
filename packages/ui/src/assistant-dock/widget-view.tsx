import { Component, type ReactNode } from 'react'
import type { AssistantWidgetPart } from '@protobase/schema'
import { ActionCard } from '../action-card'
import { useProjectUi } from '../app/pages/project-ui'

/** The part's fallback as a plain card with `note`, or a muted line naming the component when it has none. */
const Fallback = ({ part, note }: { part: AssistantWidgetPart; note: string }) =>
  part.fallback ? (
    <ActionCard title={part.fallback.title} note={note}>
      {part.fallback.body && <p className="text-[13px]">{part.fallback.body}</p>}
    </ActionCard>
  ) : (
    <p className="text-xs text-muted-foreground">{`${part.name}: ${note}`}</p>
  )

// Draws the fallback, without the raw error, when the widget throws, so one widget cannot blank the chat.
class WidgetBoundary extends Component<{ part: AssistantWidgetPart; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    return this.state.failed ? <Fallback part={this.props.part} note="It could not be drawn." /> : this.props.children
  }
}

/** A widget part, drawn by the app's component of its name with its props; the fallback when the app has none. */
export const WidgetView = ({ part }: { part: AssistantWidgetPart }) => {
  const { components = {} } = useProjectUi()
  const Widget = Object.hasOwn(components, part.name) ? components[part.name] : undefined
  if (!Widget) return <Fallback part={part} note="This version of the app cannot show it live." />
  return (
    <WidgetBoundary part={part}>
      <Widget {...part.props} />
    </WidgetBoundary>
  )
}
