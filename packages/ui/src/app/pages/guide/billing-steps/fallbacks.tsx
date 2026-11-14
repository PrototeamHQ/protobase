/** @jsxImportSource @protobase/layout */
import { Field, Page, Progress, RecordCard, component, page } from '@protobase/layout'

/** A chart the app does not register: the seats as a bar instead. */
const SeatChart = component('SeatChart', { fallback: <Progress label="Seats" value="seats_used" max="plan.seats" /> })
/** A decoration the app does not register, which draws nothing in its place. */
const Confetti = component('Confetti', { fallback: [] })
/** A component the app registers, which throws: the renewal date instead. */
const RenewalCountdown = component('RenewalCountdown', { fallback: <Field source="renews_at" label="Renews" /> })

export const billing = page(
  'billing',
  <Page title="Billing">
    <RecordCard title="Your plan" resource="subscriptions" filter="status = 'active'">
      <Field source="plan.name" label="Plan" />
      <SeatChart />
      <Confetti />
      <RenewalCountdown />
    </RecordCard>
  </Page>,
)
