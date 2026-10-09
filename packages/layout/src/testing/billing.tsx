/** @jsxImportSource @protobase/layout */
import { Action, Card, CardRow, Field, Grid, Link, ModalForm, Page, Progress, RecordCard, Show, Stat, Table, component, page } from '../index'

export const UsageChart = component<{ metric: string; days?: number }>('UsageChart')

/** The billing page from the control panel brief, as a layout test fixture. */
export const billing = page(
  'billing',
  <Page title="Billing" description="Plan, payment methods and invoices">
    <Grid columns={2}>
      <RecordCard resource="subscriptions" filter="status = 'active'" title="Current plan" actions={<Action name="cancel" variant="danger" />}>
        <Field name="plan.name" label="Plan" />
        <Progress label="Seats" value="seatsUsed" max="plan.seats" />
        <Show when="paymentMethods.count > 1">
          <Action name="upgrade" variant="primary" />
        </Show>
      </RecordCard>
      <Card title="Usage">
        <UsageChart metric="cpu" days={30} />
        <Stat label="Open invoices" resource="invoices" filter="status = 'open'" />
      </Card>
    </Grid>
    <CardRow resource="paymentMethods" sort="isDefault desc" title="Payment methods" actions={<ModalForm mode="create" label="Add card" fields={['brand', 'last4']} resource="paymentMethods" />}>
      <Field name="brand" label={false} />
      <Field name="last4" />
      <Action name="makeDefault" />
    </CardRow>
    <Table resource="invoices" sort="number desc" columns={['number', 'status', 'total']} pageSize={10} title="Invoices" />
    <Card title="Questions?">
      Mail <Link href="mailto:billing@example.com">billing@example.com</Link>
      {false}
      {3}
    </Card>
  </Page>,
  { nav: { group: 'Account' }, icon: 'credit-card' },
)
