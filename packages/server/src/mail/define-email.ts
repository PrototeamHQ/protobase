import type { FunctionComponent } from 'react'
import { mailFromVariable, smtpUrlVariable } from './mail-settings'
import { platformMailer } from './platform-mailer'
import type { Mailer } from './smtp-mailer'

export type EmailOptions<Data extends object> = {
  /** Names the email in errors, such as `welcome` or `listing-alert`. */
  name: string
  /** The subject line, or how to make it from the email's data. */
  subject: string | ((data: Data) => string)
  /**
   * The message as a React component of the email's data, such as one built from React Email's components (`react-email`).
   * It is rendered to the HTML part, and the plain-text part is made from that HTML.
   */
  component: EmailComponent<Data>
  /**
   * More header fields, or how to make them from the email's data: such as `List-Unsubscribe` with the recipient's own
   * unsubscribe link, and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, which mailbox providers expect of bulk mail.
   */
  headers?: Record<string, string> | ((data: Data) => Record<string, string>)
}

/** A function component of the email's data, as JSX writes one; typed here so the server's own types need no React. */
export type EmailComponent<Data> = (props: Data) => unknown

/** An email as `render` gives it: the subject, both parts of the body, and its header fields when it has any. */
export type RenderedEmail = { subject: string; html: string; text: string; headers?: Record<string, string> }

export type EmailTemplate<Data extends object> = {
  readonly name: string
  readonly options: EmailOptions<Data>
  /** Renders the email for `data`, without sending it: for a preview, a test, or a mailer of your own. */
  render(data: Data): Promise<RenderedEmail>
  /**
   * Renders the email for `data` and sends it to `to`: through `mailer` when given, such as a job's `context.mail`,
   * otherwise through the app's SMTP server (`PROTOBASE_SMTP_URL`, `PROTOBASE_MAIL_FROM`). Rejects when mail is off
   * or the server refuses the message.
   */
  send(to: string, data: Data, mailer?: Mailer): Promise<void>
}

/** React and React Email's renderer, loaded on the first email rendered, so an app that sends none never loads them. */
const loadRenderer = async () => {
  const [{ createElement }, { render, toPlainText }] = await Promise.all([import('react'), import('@react-email/render')])
  return { createElement, render, toPlainText }
}

/**
 * An email the app sends, with typed data: its subject and a React component for its body. Protobase renders it to
 * HTML with React Email's renderer, makes the plain-text part from that, and sends both through the app's mail.
 */
export const defineEmail = <Data extends object>(options: EmailOptions<Data>): EmailTemplate<Data> => {
  const render = async (data: Data): Promise<RenderedEmail> => {
    const renderer = await loadRenderer()
    const html = await renderer.render(renderer.createElement(options.component as FunctionComponent<Data>, data))
    const subject = typeof options.subject === 'function' ? options.subject(data) : options.subject
    const headers = typeof options.headers === 'function' ? options.headers(data) : options.headers
    return { subject, html, text: renderer.toPlainText(html), ...(headers && { headers }) }
  }

  const send = async (to: string, data: Data, mailer = platformMailer()) => {
    if (!mailer) throw new Error(`Email "${options.name}" cannot be sent: mail is off; set ${smtpUrlVariable} and ${mailFromVariable}`)
    await mailer.send({ to, ...(await render(data)) })
  }

  return { name: options.name, options, render, send }
}
