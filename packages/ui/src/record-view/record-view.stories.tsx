import type { Meta, StoryObj } from '@storybook/react-vite'
import { InvoiceRecordView } from './index'

const meta = {
  title: 'Components/RecordView',
  component: InvoiceRecordView,
  parameters: { layout: 'fullscreen' },
  args: { saveFeedback: 'toast' },
} satisfies Meta<typeof InvoiceRecordView>
export default meta
type Story = StoryObj<typeof meta>

export const ToastFeedback: Story = {}
export const ButtonFeedback: Story = { args: { saveFeedback: 'button' } }
export const NoConflict: Story = { args: { conflictField: 'none', presenceUserIds: ['u1'] } }
