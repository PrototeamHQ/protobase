import type { AssistantState } from '@protobase/schema'
import { ActionCard } from '../action-card'
import { fakeAssistant } from '../app/testing/fake-assistant'
import { useBackendData } from './use-backend-data'

type Task = { title: string; status: 'waiting' | 'approved' | 'declined'; decidedBy?: string }

const taskPath = (taskId: number) => `/api/assistant/tasks/${taskId}`

/** A widget as an app writes one: it reads the task from the backend and posts the user's decision there. */
const TaskReview = ({ taskId }: { taskId: number }) => {
  const path = taskPath(taskId)
  const task = useBackendData<Task>(path)
  if (!task.data) return <ActionCard title="Task" note={task.error ? 'Could not load the task' : 'Loading'} />
  const { title, status, decidedBy } = task.data
  return (
    <ActionCard
      title={title}
      tone={status === 'declined' ? 'neutral' : 'info'}
      badge={status}
      note={task.error?.message ?? (decidedBy && `${status === 'approved' ? 'Approved' : 'Declined'} by ${decidedBy}`)}
      actions={status === 'waiting' ? [{ id: 'approve', label: 'Approve', style: 'primary' }, { id: 'decline', label: 'Decline' }] : []}
      onAction={(action) => void task.post(`${path}/actions`, { action })}
    />
  )
}

const Broken = (): never => {
  throw new Error('Broken widget')
}

export const widgetComponents = { TaskReview, Broken }

/** A backend with two tasks, one of which someone else declined after the chat showed it. */
export const taskBackend = () => {
  const tasks = new Map<string, Task>([
    [taskPath(7), { title: 'Add a discount to invoices', status: 'waiting' }],
    [taskPath(8), { title: 'Archive old customers', status: 'declined', decidedBy: 'Grace Hopper' }],
  ])
  return fakeAssistant({
    serve: async (path, init) => {
      const task = tasks.get(path.replace(/\/actions$/, ''))
      if (!task) return Response.json({ type: 'urn:protobase:problem:not-found', title: 'Not Found', status: 404 }, { status: 404 })
      if (init.method !== 'POST') return Response.json(task)
      if (task.status !== 'waiting') return Response.json({ type: 'urn:protobase:problem:conflict', title: 'Conflict', status: 409, detail: `${task.decidedBy} decided already` }, { status: 409 })
      const { action } = JSON.parse(String(init.body)) as { action: string }
      Object.assign(task, { status: action === 'approve' ? 'approved' : 'declined', decidedBy: 'Ada Lovelace' })
      return Response.json(task)
    },
  })
}

/** Widget parts: two the app draws, one it has no component for, with and without a fallback, and one that throws. */
export const widgetConversation: AssistantState = {
  replying: false,
  messages: [
    { id: 'm1', from: 'user', parts: [{ type: 'text', id: 'm1-text', text: 'Which tasks wait for me?' }] },
    {
      id: 'm2',
      from: 'assistant',
      parts: [
        { type: 'widget', id: 'task-7', name: 'TaskReview', props: { taskId: 7 }, fallback: { title: '#7 Add a discount to invoices' } },
        { type: 'widget', id: 'task-8', name: 'TaskReview', props: { taskId: 8 }, fallback: { title: '#8 Archive old customers' } },
        { type: 'widget', id: 'usage', name: 'UsageChart', props: { metric: 'cpu' }, fallback: { title: 'CPU usage this week', body: 'Peaked at 82% on Tuesday.' } },
        { type: 'widget', id: 'invoice', name: 'InvoicePreview', props: { invoiceId: 39 } },
        { type: 'widget', id: 'broken', name: 'Broken', props: {}, fallback: { title: 'A broken widget' } },
      ],
    },
  ],
}
