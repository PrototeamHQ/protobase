/** @jsxImportSource @protobase/layout */
import { describe, expect, it } from 'vitest'
import { Card, Link, Page, Table } from './blocks'
import { Text } from './elements'
import { page } from './page'
import { fillProps } from './scope-values'
import { formatMessage, formatText, readerLanguage, Trans, transKeys, translationProblems, translations } from './translations'
import { recordLayout } from './typed/layout'

const en = { today: { title: 'Today', open: '{count, plural, one {# open task} other {# open tasks}}', owner: 'Owned by <b>{name}</b>' } }
const nl = { today: { title: 'Vandaag', open: '{count, plural, one {# open taak} other {# open taken}}', owner: 'Van <b>{name}</b>' } }

describe('translations', () => {
  it('flattens each language by dotted key', () => {
    expect(translations({ en, nl }).languages.nl).toEqual({ 'today.title': 'Vandaag', 'today.open': nl.today.open, 'today.owner': 'Van <b>{name}</b>' })
  })

  it('refuse a message that is not ICU, a key a language lacks and a tag that is no language', () => {
    expect(() => translations({ en: { a: '{count, plural, one {x}' } })).toThrow(/"a" is not an ICU message/)
    expect(() => translations({ en: { a: 'A', b: 'B' }, nl: { a: 'A' } })).toThrow(/nl lacks "b", which en has/)
    expect(() => translations({ 'not a tag': { a: 'A' } })).toThrow(/is not a language tag/)
  })

  it('format a message with its values and plurals in the language, and its tags as text or through components', () => {
    const texts = { locale: 'nl', messages: translations({ en, nl }).languages.nl! }
    expect(formatText(texts, 'today.open', { count: 1 })).toBe('1 open taak')
    expect(formatText(texts, 'today.open', { count: 3 })).toBe('3 open taken')
    expect(formatText(texts, 'today.owner', { name: 'Sam' })).toBe('Van Sam')
    expect(formatMessage(texts, 'today.owner', { name: 'Sam' }, { b: (chunks) => ({ bold: chunks.join('') }) })).toEqual(['Van ', { bold: 'Sam' }])
    expect(formatText(texts, 'missing')).toBe('missing')
  })

  it("pick the reader's language: the app's own, else theirs by tag or language, else English or the first", () => {
    expect(readerLanguage(['en', 'nl'], ['de-DE', 'nl-BE'])).toBe('nl')
    expect(readerLanguage(['en', 'nl'], ['nl-BE'], 'en')).toBe('en')
    expect(readerLanguage(['en', 'pt-BR'], ['pt-BR'])).toBe('pt-BR')
    expect(readerLanguage(['nl', 'de'], ['fr'])).toBe('nl')
  })
})

describe('a <Trans> in a layout', () => {
  const tree = (
    <Page title={<Trans i18nKey="today.title" />}>
      <Card title={<Trans i18nKey="today.open" values={{ count: 2 }} />}>
        <Trans i18nKey="today.owner" values={{ name: '{{owner}}' }} components={{ b: <Text as="strong" /> }} />
      </Card>
    </Page>
  )

  it('goes where text goes, and names its key', () => {
    expect(transKeys(tree)).toEqual(['today.title', 'today.open', 'today.owner'])
    expect(page('today', tree).toModel().title).toBe('today.title')
  })

  it('is checked against the texts: a key no language has, a value it lacks and a tag with no element', () => {
    const texts = translations({ en, nl })
    expect(translationProblems([{ at: 'Page "today"', tree }], texts)).toEqual([])
    const broken = (
      <Card title={<Trans i18nKey="today.nope" />}>
        <Trans i18nKey="today.owner" />
        <Link to={{ kind: 'page', page: 'today' }}>
          <Trans i18nKey="today.open" />
        </Link>
      </Card>
    )
    expect(translationProblems([{ at: 'Page "x"', tree: broken }], texts)).toEqual([
      'Page "x": <Trans i18nKey="today.nope">: no language has "today.nope"',
      'Page "x": <Trans i18nKey="today.owner"> formats {name}; give it in values',
      'Page "x": <Trans i18nKey="today.owner"> has the tag <b>; give each an element in components',
      'Page "x": <Trans i18nKey="today.open"> formats {count}; give it in values',
    ])
    expect(translationProblems([{ at: 'Page "today"', tree }], undefined)[0]).toContain('needs the app\'s texts')
  })

  it("fills its values from the record around it, in a prop's text too", () => {
    const card = <Card title={<Trans i18nKey="today.owner" values={{ name: '{{owner}}' }} components={{ b: <Text as="strong" /> }} />} />
    expect(fillProps(card, { stack: [{ record: { owner: 'Sam' } }] }).props.title).toMatchObject({ props: { values: { name: 'Sam' } } })
  })

  it("takes a typed layout's recorded path as a value", () => {
    const typed = recordLayout('tasks', ({ data }) => <Table title={<Trans i18nKey="today.owner" values={{ name: data.owner }} />} resource="tasks" />)
    expect(typed.props.title).toMatchObject({ props: { values: { name: '{{owner}}' } } })
  })
})

describe('a <Trans> read as text', () => {
  it("reads in the reader's language, its tags as their elements' Markdown and its prop texts as text", async () => {
    const { renderText } = await import('./text/render-text')
    const texts = { locale: 'nl', messages: translations({ en, nl }).languages.nl! }
    const tree = (
      <Card title={<Trans i18nKey="today.open" values={{ count: 1 }} />}>
        <Trans i18nKey="today.owner" values={{ name: '{{owner}}' }} components={{ b: <Text as="strong" /> }} />
      </Card>
    )
    expect(renderText(tree, { texts, record: { owner: 'Sam_1' } })).toBe('### 1 open taak\n\nVan **Sam\\_1**')
    expect(renderText(<Trans i18nKey="today.title" />)).toBe('today.title')
  })
})
