import { l } from '@protobase/schema'
import { customersView, repairsView as filtered } from './step-3'

// Step 4: a record page that reads like the paper repair card: what is wrong, who works on it, what it costs.

export { customersView }

export const repairsView = filtered
  .fields((r) => ({
    problem: r.problem.help('In the customer’s words; the mechanic adds findings to the notes.'),
    notes: r.notes.label('Workshop notes').help('Only the workshop reads these.'),
    paid: r.paid.help('Set when the customer pays at the desk.'),
  }))
  .layout((r) => [
    l.section('The bike', [r.customerId, r.bike, r.problem]),
    l.section('In the workshop', [r.status, r.mechanic, r.notes], { help: 'Pick up a repair by putting your name on it.' }),
    l.section('Money', [r.estimate, r.currency, r.paid]),
    l.sidebar([r.status, r.estimate, r.bookedOn]),
  ])
  .saveFeedback('button')
