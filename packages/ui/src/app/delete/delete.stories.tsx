import type { Meta, StoryObj } from '@storybook/react-vite'
import { Toast } from '../../toasts'
import { BulkDeleteDialog, ConfirmDeleteDialog, ConflictDialog } from './dialogs'

const meta = { title: 'Delete', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const backdrop = (content: React.ReactNode) => <div className="h-screen bg-surface">{content}</div>

export const Confirm: StoryObj = {
  render: () => backdrop(<ConfirmDeleteDialog title="SO-2026-139874" noun="Order" onCancel={() => undefined} onConfirm={() => undefined} />),
}

export const ChangedSinceOpened: StoryObj = {
  render: () =>
    backdrop(
      <ConflictDialog
        title="SO-2026-139874"
        changes={[
          { field: 'status', label: 'Status', before: 'Draft', after: 'Confirmed' },
          { field: 'total', label: 'Total', before: '€26.70', after: '€31.20' },
          { field: 'discountPercent', label: 'Discount', before: '0%', after: '5%' },
        ]}
        onCancel={() => undefined}
        onReview={() => undefined}
        onDeleteAnyway={() => undefined}
      />,
    ),
}

export const BulkConfirm: StoryObj = {
  render: () => backdrop(<BulkDeleteDialog stage="confirm" count={12} plural="Orders" onCancel={() => undefined} onConfirm={() => undefined} />),
}

export const BulkRunning: StoryObj = { render: () => backdrop(<BulkDeleteDialog stage="running" done={7} total={12} />) }

export const BulkPartialFailure: StoryObj = {
  render: () =>
    backdrop(
      <BulkDeleteDialog
        stage="done"
        total={12}
        failures={[
          { title: 'SO-2026-139874', message: 'Changed since the list loaded, so it was kept.' },
          { title: 'SO-2026-139870', message: 'You are not allowed to delete this record.' },
        ]}
        onClose={() => undefined}
      />,
    ),
}

export const UndoToast: StoryObj = {
  render: () => backdrop(<div className="flex justify-end p-6"><Toast state="success" title="Hydraulic coupling 3/8 in deleted" action={{ label: 'Undo', onClick: () => undefined }} onDismiss={() => undefined} /></div>),
}
