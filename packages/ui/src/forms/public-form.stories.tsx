import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ApiError, createStaticSession, type AuthSession, type ProblemError, type PublicForm } from '@protobase/client'
import { contactRequests, contactRequestsView } from '../../../../docs-examples/forms/contact'
import { App } from '../app/app'
import { fakeApi } from '../app/testing/fake-api'

const viewports = { mobile360: { name: 'Mobile 360', styles: { width: '360px', height: '740px' }, type: 'mobile' } } as const

const meta = { title: 'Public form', parameters: { layout: 'fullscreen', viewport: { options: viewports } } } satisfies Meta
export default meta

// Nobody signed in, and no anonymous role that reads: the rest of the app would ask to sign in.
const signedIn = createStaticSession('story-token', { id: 'story', email: 'story@example.test', name: 'Story User', role: 'user' })
const nobody: AuthSession = { ...signedIn, session: async () => undefined }

const view = contactRequestsView.toModel()
const contact: PublicForm = { ...view.forms![0]!, resource: contactRequests.toModel(), view }

const refusal = (status: number, slug: string, detail: string, errors?: ProblemError[]) =>
  new ApiError({ type: `urn:protobase:problem:${slug}`, title: status === 429 ? 'Too Many Requests' : 'Bad Request', status, detail, ...(errors && { errors }) })

// The requests the story's form created, for its checks
const saved: Array<Record<string, unknown>> = []

const ContactForm = ({ submitForm }: { submitForm?: () => Promise<void> }) => {
  const [api] = useState(() => {
    saved.length = 0
    return fakeApi({ resources: [contactRequests.toModel()], views: [view], rows: { contact_requests: [] }, forms: [contact], afterWrite: (_, row) => void saved.push(row), ...(submitForm && { submitForm }) })
  })
  return (
    <div className="h-screen">
      <App client={api.client} auth={nobody} initialUrl="/-/forms/contact" />
    </div>
  )
}

const fill = async (canvasElement: HTMLElement, { email = 'ada@example.com' } = {}) => {
  const canvas = within(canvasElement)
  await userEvent.type(await canvas.findByRole('textbox', { name: 'Your name' }), 'Ada')
  await userEvent.type(canvas.getByRole('textbox', { name: 'Email' }), email)
  await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Topic' }), 'A repair')
  await userEvent.type(canvas.getByRole('textbox', { name: 'Message' }), 'My brakes squeak.')
  await userEvent.click(canvas.getByRole('button', { name: 'Send' }))
  return canvas
}

export const Sending: StoryObj = { name: 'A contact form', render: () => <ContactForm /> }

export const SendingChecks: StoryObj = {
  ...Sending,
  name: 'A contact form (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(await canvas.findByRole('heading', { name: 'Contact us' })).toBeVisible()
    expect(canvas.queryByRole('link', { name: 'Sign in' })).toBeNull()
    await fill(canvasElement)
    // The browser solves the bot check, then the form gives way to its thanks
    expect(await canvas.findByRole('status')).toHaveTextContent('Thanks, we will reply within a day.')
    expect(canvas.queryByRole('button', { name: 'Send' })).toBeNull()
    expect(saved).toEqual([expect.objectContaining({ name: 'Ada', email: 'ada@example.com', topic: 'repair', message: 'My brakes squeak.' })])
  },
}

export const Refused: StoryObj = {
  name: 'A contact form the server refuses',
  render: () => <ContactForm submitForm={() => Promise.reject(refusal(400, 'invalid-record', 'email', [{ field: 'email', code: 'invalid-record', message: 'Enter an email address' }]))} />,
}

export const RefusedChecks: StoryObj = {
  ...Refused,
  name: 'A contact form the server refuses (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = await fill(canvasElement, { email: 'ada at example' })
    // The problem shows under its field, which takes focus; nothing else is said
    expect(await canvas.findByText('Enter an email address')).toBeVisible()
    const email = canvas.getByRole('textbox', { name: 'Email' })
    await waitFor(() => expect(email).toHaveFocus())
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(canvas.queryByRole('alert')).toBeNull()
    expect(canvas.getByRole('button', { name: 'Send' })).toBeEnabled()
  },
}

export const TooOften: StoryObj = {
  name: 'A contact form sent too often',
  render: () => <ContactForm submitForm={() => Promise.reject(refusal(429, 'too-many-submissions', 'This form was sent too often; wait a minute and send it again'))} />,
}

export const TooOftenChecks: StoryObj = {
  ...TooOften,
  name: 'A contact form sent too often (checks)',
  tags: ['play', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = await fill(canvasElement)
    const banner = await canvas.findByRole('alert')
    expect(banner).toHaveTextContent('Not sent')
    expect(banner).toHaveTextContent('This form was sent too often; wait a minute and send it again')
    // What was typed stays, to send again
    expect(canvas.getByRole('textbox', { name: 'Message' })).toHaveValue('My brakes squeak.')
  },
}

export const OnAPhone: StoryObj = {
  name: 'A contact form on a phone',
  globals: { viewport: { value: 'mobile360' } },
  render: () => <ContactForm />,
}

export const OnAPhoneChecks: StoryObj = {
  ...OnAPhone,
  name: 'A contact form on a phone (checks)',
  tags: ['play', 'phone', '!dev'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const message = await canvas.findByRole('textbox', { name: 'Message' })
    // Every field and the button fit the screen, which scrolls as a whole
    for (const control of [message, canvas.getByRole('textbox', { name: 'Your name' }), canvas.getByRole('button', { name: 'Send' })]) {
      expect(control.getBoundingClientRect().left).toBeGreaterThanOrEqual(0)
      expect(control.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth)
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    await fill(canvasElement)
    expect(await canvas.findByRole('status')).toHaveTextContent('Thanks, we will reply within a day.')
  },
}
