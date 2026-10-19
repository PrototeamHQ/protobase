import type { ReactNode } from 'react'
import { Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Text } from 'react-email'
import type { MailingApp } from './mailing-app'

// The look of the React Email templates in Protobase's examples and docs: a white card on grey, a teal action.
const styles = {
  body: { backgroundColor: '#f4f4f5', fontFamily: 'Helvetica, Arial, sans-serif', color: '#18181b' },
  container: { backgroundColor: '#ffffff', padding: '24px', maxWidth: '480px' },
  heading: { fontSize: '20px' },
  rule: { borderColor: '#e4e4e7' },
  footer: { color: '#71717a', fontSize: '13px', margin: '0' },
  footerLink: { color: '#71717a' },
  note: { color: '#71717a', fontSize: '13px' },
  code: { fontFamily: 'Menlo, Consolas, monospace', fontSize: '28px', fontWeight: 600, letterSpacing: '4px', margin: '16px 0' },
  button: { backgroundColor: '#0f766e', color: '#ffffff', padding: '12px 20px', borderRadius: '6px', fontWeight: 600 },
}

export type EmailLayoutProps = {
  app: MailingApp
  /** The line inboxes show after the subject. */
  preview: string
  heading: string
  children: ReactNode
}

/** An email: its heading and body on a card, and a footer naming the app, linked to its home page. */
export const EmailLayout = ({ app, preview, heading, children }: EmailLayoutProps) => (
  <Html lang="en">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={styles.body}>
      <Container style={styles.container}>
        <Heading as="h1" style={styles.heading}>
          {heading}
        </Heading>
        {children}
        <Hr style={styles.rule} />
        <Text style={styles.footer}>
          <Link href={app.url} style={styles.footerLink}>
            {app.name}
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

/** A code to type in, on a line of its own in both parts. */
export const EmailCode = ({ code }: { code: string }) => <Text style={styles.code}>{code}</Text>

/** A remark below the message, such as what to do when the email was not expected. */
export const EmailNote = ({ children }: { children: ReactNode }) => <Text style={styles.note}>{children}</Text>

/** The email's one action, such as signing in: a button, and the label with the link in the plain-text part. */
export const EmailButton = ({ href, children }: { href: string; children: ReactNode }) => (
  <Button href={href} style={styles.button}>
    {children}
  </Button>
)
