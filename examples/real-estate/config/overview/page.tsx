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
          <Field name="leaseId" label="Lease" />
          <Field name="balance" label="Outstanding" />
          <Field name="openCharges" label="Open months" />
          <Field name="oldestDueOn" label="Oldest due" />
        </Grid>
        <Field name="leaseId.unitId" label="Unit" />
      </RecordCard>
      <RecordCard
        title="Oldest urgent ticket"
        resource="tickets"
        filter="priority = 'urgent' AND (status = 'reported' OR status = 'scheduled')"
        sort="reportedAt"
        empty="No urgent tickets are open."
        actions={<Action name="complete" variant="primary" />}
      >
        <Grid columns={2}>
          <Field name="number" />
          <Field name="status" />
          <Field name="propertyId" label="Property" />
          <Field name="reportedAt" label="Reported" />
        </Grid>
        <Field name="title" />
      </RecordCard>
    </Grid>
    <Grid columns={2}>
      <Table title="Arrears" resource="arrears" sort="balance desc" columns={['leaseId', 'balance', 'openCharges', 'oldestDueOn']} pageSize={5} empty="Every tenant is paid up." />
      <Table title="Open tickets" resource="tickets" filter="status = 'reported' OR status = 'scheduled'" sort="reportedAt desc" columns={['number', 'title', 'priority', 'status']} pageSize={5} empty="Nothing is open." />
    </Grid>
    <Table title="Vacant units" resource="units" filter="status = 'vacant'" columns={['label', 'propertyId', 'bedrooms', 'baseRent']} pageSize={5} empty="Every unit is let." />
  </Page>,
  { nav: { group: 'Portfolio', order: 0 }, icon: 'layout-dashboard' },
)
