import { ChatMessage } from './chat-message'
import type { DockItem } from './model'
import { PlanCard, type PlanCardProps } from './plan-card'
import { ProgressCard } from './progress-card'
import { QueryCard } from './query-card'
import { QueueCard } from './queue-card'
import { ResultCard } from './result-card'

export type DockItemHandlers = Pick<PlanCardProps, 'onApprove' | 'onRequestChanges' | 'onCancel' | 'onUpdatePlan'>

export const DockItemView = ({ item, balance, handlers }: { item: DockItem; balance: number; handlers: DockItemHandlers }) => {
  switch (item.kind) {
    case 'user':
    case 'assistant':
      return <ChatMessage from={item.kind} text={item.text} />
    case 'queue':
      return <QueueCard taskId={item.taskId} request={item.request} ahead={item.ahead} waitingOnPlan={item.waitingOnPlan} onCancel={handlers.onCancel} />
    case 'progress':
      return <ProgressCard phase={item.phase} steps={item.steps} />
    case 'plan':
      return <PlanCard plan={item.plan} balance={balance} {...handlers} />
    case 'result':
      return <ResultCard result={item.result} />
    case 'query':
      return <QueryCard query={item.query} />
  }
}
