/** @jsxImportSource @protobase/layout */
import { Action, Card, CardRow, Field, Grid, ModalForm, Page, RecordCard, Show, Stat, Table, component, page } from '@protobase/layout'

/** Orders per day for the last `days` days, drawn by protobase.ui.tsx. */
export const OrdersPerDay = component<{ days: 7 | 30 | 90 }>('OrdersPerDay')

/** The sales team's start page: what needs attention today, and the leads to follow up. */
export const salesOverview = page(
  'overview',
  <Page title="Sales overview" description="What needs attention today: unpaid orders, overdue invoices and new leads.">
    <Show when="orders.count = 0">
      <Card title="No orders yet">Create the first order from Orders; this page fills up as the team sells.</Card>
    </Show>
    <Grid columns={4}>
      <Stat label="Draft orders" resource="orders" filter="status = 'draft'" />
      <Stat label="Delivered, not paid" resource="orders" filter="status = 'delivered' AND paid = false" />
      <Stat label="Overdue invoices" resource="invoices" filter="status = 'overdue'" />
      <Stat label="Open leads" resource="companies" filter="status = 'lead'" />
    </Grid>
    <Grid columns={3}>
      <RecordCard
        title="Biggest unpaid delivery"
        resource="orders"
        filter="status = 'delivered' AND paid = false"
        sort="total desc"
        empty="Every delivered order is paid."
        actions={<Action name="markPaid" variant="primary" />}
      >
        <Grid columns={2}>
          <Field name="number" />
          <Field name="total" />
          <Field name="company_id" label="Customer" />
          <Field name="company_id.city" label="City" />
        </Grid>
        <Show when="company_id.status = 'dormant'">The customer has gone quiet: call before sending a reminder.</Show>
      </RecordCard>
      <RecordCard
        title="Oldest overdue invoice"
        resource="invoices"
        filter="status = 'overdue'"
        sort="issued_at"
        empty="Nothing is overdue."
        actions={[<Action name="send" label="Send reminder" />, <Action name="recordPayment" variant="primary" />]}
      >
        <Grid columns={2}>
          <Field name="number" />
          <Field name="total" />
          <Field name="company_id" label="Customer" />
          <Field name="due_at" label="Due" />
        </Grid>
      </RecordCard>
      <Card title="Orders per day" description="The last 30 days.">
        <OrdersPerDay days={30} />
      </Card>
    </Grid>
    <Grid columns={2}>
      <Table title="Overdue invoices" resource="invoices" filter="status = 'overdue'" sort="issued_at" columns={['number', 'company_id', 'due_at', 'total']} limit={5} empty="Nothing is overdue." />
      <Table title="Latest orders" resource="orders" sort="created_at desc" columns={['number', 'company_id', 'status', 'total']} limit={5} />
    </Grid>
    <CardRow
      title="New leads"
      description="Companies that have not ordered yet."
      resource="companies"
      filter="status = 'lead'"
      sort="created_at desc"
      limit={8}
      actions={<ModalForm mode="create" label="Add lead" resource="companies" fields={['name', 'city', 'country_code', 'email']} values={{ status: 'lead' }} />}
    >
      <Field name="name" label={false} />
      <Field name="city" />
      <Field name="email" />
      <ModalForm mode="edit" label="Edit" fields={['name', 'city', 'email', 'phone', 'status']} />
    </CardRow>
  </Page>,
  { nav: { group: 'Sales', order: 0 }, icon: 'layout-dashboard' },
)
