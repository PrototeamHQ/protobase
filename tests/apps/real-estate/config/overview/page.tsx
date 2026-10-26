/** @jsxImportSource @protobase/layout */
import { Action, Card, Field, Grid, Page, RecordCard, Show, Stat, Table, page } from '@protobase/layout'

/** The property manager's start page: occupancy, rent outstanding and the maintenance that is still open. */
export const portfolioOverview = page(
  'overview',
  <Page title="Portfolio overview" description="Occupancy, arrears and open maintenance across the portfolio.">
    <Show when="units.count = 0">
      <Card title="No units yet">Add a property and its units; this page fills up as leases start.</Card>
    </Show>
    <Grid columns={4}>
      <Stat label="Units" resource="units" />
      <Stat label="Vacant" resource="units" filter="status = 'vacant'" description="Ready to let" />
      <Stat label="Leases in arrears" resource="arrears" />
      <Stat label="Open tickets" resource="tickets" filter="status = 'reported' OR status = 'scheduled'" />
    </Grid>
    <Grid columns={2}>
      <RecordCard
        title="Largest arrears"
        resource="arrears"
        sort="balance desc"
        empty="Every tenant is paid up."
        actions={<Action name="remind" label="Send reminder" variant="primary" />}
      >
        <Grid columns={2}>
          <Field name="lease_id" label="Lease" />
          <Field name="balance" label="Outstanding" />
          <Field name="open_charges" label="Open months" />
          <Field name="oldest_due_on" label="Oldest due" />
        </Grid>
        <Field name="lease_id.unit_id" label="Unit" />
      </RecordCard>
      <RecordCard
        title="Oldest urgent ticket"
        resource="tickets"
        filter="priority = 'urgent' AND (status = 'reported' OR status = 'scheduled')"
        sort="reported_at"
        empty="No urgent tickets are open."
        actions={<Action name="complete" variant="primary" />}
      >
        <Grid columns={2}>
          <Field name="number" />
          <Field name="status" />
          <Field name="property_id" label="Property" />
          <Field name="reported_at" label="Reported" />
        </Grid>
        <Field name="title" />
      </RecordCard>
    </Grid>
    <Grid columns={2}>
      <Table title="Arrears" resource="arrears" sort="balance desc" columns={['lease_id', 'balance', 'open_charges', 'oldest_due_on']} limit={5} empty="Every tenant is paid up." />
      <Table title="Open tickets" resource="tickets" filter="status = 'reported' OR status = 'scheduled'" sort="reported_at desc" columns={['number', 'title', 'priority', 'status']} limit={5} empty="Nothing is open." />
    </Grid>
    <Table title="Vacant units" resource="units" filter="status = 'vacant'" columns={['label', 'property_id', 'bedrooms', 'base_rent']} limit={5} empty="Every unit is let." />
  </Page>,
  { nav: { group: 'Portfolio', order: 0 }, icon: 'layout-dashboard' },
)
