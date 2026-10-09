import type { Meta, StoryObj } from '@storybook/react-vite'
import { Input } from '../../primitives/input'
import { CreateRecordForm, type CreateRecordFormProps } from './create-record-form'

const meta = {
  title: 'Create/CreateRecordForm',
  component: CreateRecordForm,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="h-screen"><Story /></div>],
  args: {
    noun: 'Order',
    collection: 'Orders',
    saving: false,
    onSubmit: () => undefined,
    onCancel: () => undefined,
    sections: [
      {
        title: 'Details',
        help: 'The basics of the order. Fields marked * are required.',
        fields: [
          { name: 'number', label: 'Number', required: true, help: 'Unique per organization.', editor: <Input placeholder="SO-2026-140001" /> },
          { name: 'company', label: 'Company', required: true, help: 'The customer placing the order.', editor: <Input placeholder="Search companies" /> },
          { name: 'status', label: 'Status', required: true, editor: <Input value="Draft" readOnly /> },
          { name: 'total', label: 'Total', help: 'Including VAT.', editor: <Input className="text-right tabular-nums" placeholder="0.00" /> },
        ],
      },
    ],
  },
} satisfies Meta<CreateRecordFormProps>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}

export const WithValidationErrors: Story = {
  args: {
    sections: [
      {
        title: 'Details',
        fields: [
          { name: 'number', label: 'Number', required: true, error: 'An order with this number already exists.', editor: <Input invalid defaultValue="SO-2026-139874" /> },
          { name: 'company', label: 'Company', required: true, error: 'Choose a company.', editor: <Input invalid placeholder="Search companies" /> },
        ],
      },
    ],
  },
}

export const Saving: Story = { args: { saving: true } }
