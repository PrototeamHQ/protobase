---
title: A create page of your own
description: Replace a resource's create form with a page of the app's own, built from the app's form parts, that creates records through an API function.
---

Pip's bike shop books repairs at the desk, and a booking is more than a row: the workshop wants to know what the bike needs, in words a customer understands, and the shop's API function plans the job. This guide gives the repairs a page of their own for that, opened by **New** on their list, and lets the API refuse plain creates. It uses the bike shop of the [first guide](/guides/table-to-admin/).

## 1. The page

A create page is a [composed page](/reference/layouts/) like any other, with a [component](/reference/custom-components/#components) of the project's own in it:

```tsx
// config/pages/book-repair.tsx
/** @jsxImportSource @protobase/layout */
import { Page, component, page } from '@protobase/layout'

export const BookRepair = component('BookRepair')

export const bookRepair = page(
  'book-repair',
  <Page title="Book a repair" description="What the bike needs, so the workshop can plan it.">
    <BookRepair />
  </Page>,
  { roles: ['desk', 'admin'] },
)
```

Its `roles` say who may book: they are the people who get the page, and so **New**. Protobase finds pages among the exports of `config/index.ts`, so export it there: `export { bookRepair } from './pages/book-repair'`.

## 2. The component

The component asks its questions with the [form parts](/reference/custom-components/#form-parts) of `@protobase/ui`, so it looks like the app's own forms, and keeps the answers in the address, so a reload keeps them:

```tsx
// components/book-repair.tsx, exported from protobase.ui.tsx: export { BookRepair } from './components/book-repair'
import { Choices, Field, Form, Input, Section, useAppAddress, useClient } from '@protobase/ui'
import { useState } from 'react'

const kinds = [
  { value: 'service', label: 'Service', description: 'The whole bike checked: brakes, gears, tyres and chain.' },
  { value: 'flat', label: 'Flat tyre', description: 'A new inner tube, and the tyre checked for what caused it.' },
  { value: 'other', label: 'Something else', description: 'Say what is wrong at the desk.' },
]

export const BookRepair = () => {
  const { address, go } = useAppAddress()
  const client = useClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>()
  const values = address?.kind === 'create' ? (address.values ?? {}) : {}
  const answer = (patch: Record<string, string>) => go({ kind: 'create', resource: 'repairs', values: { ...values, ...patch } }, { replace: true })

  const book = () => {
    setSaving(true)
    client.invoke('book-repair', { body: values }).then(
      (repair) => go({ kind: 'record', resource: 'repairs', key: (repair as { id: number }).id }),
      (failure) => {
        setSaving(false)
        setError(failure)
      },
    )
  }

  return (
    <Form submit="Book repair" disabled={!values.bike || !values.kind} saving={saving} error={error} errorTitle="Not booked" onSubmit={book}>
      <Section title="The bike">
        <div className="flex flex-col gap-5">
          <Field label="Bike" required help="Make and model, as on the frame.">
            <Input value={values.bike ?? ''} onChange={(event) => answer({ bike: event.target.value })} />
          </Field>
          <Field label="What it needs" required>
            <Choices name="kind" label="What it needs" options={kinds} value={values.kind} onChange={(kind) => answer({ kind })} />
          </Field>
        </div>
      </Section>
    </Form>
  )
}
```

Without a `title`, the `Form` sits under the page's heading, with its button after the sections.

## 3. Point the view at it

```ts
// config/repairs/ui.ts
export const repairsView = view<typeof repairs>('repairs')
  // ...
  .create({ page: 'book-repair' })
```

**New** on the repairs list now opens the page at `/repairs/new`, and so does every link to a new repair, such as one on a customer's page with `values: { customer_id: '{id}' }`. Someone the page leaves out gets no **New**, and `/repairs/new` tells them they cannot create repairs; the plain create form no longer shows. The server refuses a page name it does not know when it starts.

## 4. Create through a function

With its own page, the shop can make the [API function](/guides/api-functions/) `book-repair`, the default export of `functions/book-repair.ts`, the only way in: it checks the answers, plans the job and inserts the repair with `db`, which skips the access rules. The resource's API then refuses creates:

```ts
// config/repairs/data.ts
export const repairs = resource('repairs')
  // ...
  .access({ create: () => false })
```

**New** follows the page, not this rule, so it stays for the desk. **Import** on the list follows the rule, and goes.

The [UI config](/reference/ui-config/#create-pages) has the details.
