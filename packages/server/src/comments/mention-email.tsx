/** @jsxImportSource @protobase/layout */
import { ArrayField, Button, RecordsIterator, Text, Trans, translations } from '@protobase/layout'
import { defineTemplate } from '../mail/template/define-template'

/** The comment comes as its lines, `commentLines(body)`, so each keeps its own line in both parts. */
export type MentionData = { author: string; record: string; lines: { text: string }[]; url: string }

/** A comment's text as the mention email takes it: one item per line. */
export const commentLines = (body: string) => body.split('\n').map((text) => ({ text }))

const texts = translations({
  en: {
    subject: '{author} mentioned you on {record}',
    preview: '{author} mentioned you on {record}',
    heading: '{author} mentioned you',
    intro: '{author} mentioned you in a comment on {record} in {app}:',
    action: 'Open {record}',
    note: 'You get this email because someone mentioned you. Reply in the app, not to this email.',
  },
  nl: {
    subject: '{author} heeft je genoemd bij {record}',
    preview: '{author} heeft je genoemd bij {record}',
    heading: '{author} heeft je genoemd',
    intro: '{author} heeft je genoemd in een opmerking bij {record} in {app}:',
    action: '{record} openen',
    note: 'Je krijgt deze e-mail omdat iemand je heeft genoemd. Reageer in de app, niet op deze e-mail.',
  },
})

/** The email to someone a comment mentions: who wrote it on which record, the comment, and a link to the record. */
export const mentionEmail = defineTemplate<MentionData>({
  name: 'mention',
  texts,
  subject: ({ data }) => <Trans i18nKey="subject" values={{ author: data.author, record: data.record }} />,
  preview: ({ data }) => <Trans i18nKey="preview" values={{ author: data.author, record: data.record }} />,
  body: ({ data, app }) => (
    <>
      <Text as="h1">
        <Trans i18nKey="heading" values={{ author: data.author }} />
      </Text>
      <Text>
        <Trans i18nKey="intro" values={{ author: data.author, record: data.record, app: app.name }} />
      </Text>
      <ArrayField source="lines">
        <RecordsIterator>
          <Text>{'{{text}}'}</Text>
        </RecordsIterator>
      </ArrayField>
      <Button href={`${data.url}`}>
        <Trans i18nKey="action" values={{ record: data.record }} />
      </Button>
      <Text>
        <Trans i18nKey="note" />
      </Text>
    </>
  ),
})
