import { describe, expect, it } from 'vitest'
import { definitionWarnings } from './check-warnings'
import { problemText } from './problem'
import type { Definition } from './types'

const warn = (States: Definition['stateMachine']['States'], doNotRepeat: string[] = []) =>
  definitionWarnings({ trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: Object.keys(States)[0]!, States } }, { doNotRepeat }).map(problemText)

const link = { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://mail.test/link' }, Assign: { link: '{% $states.result.body.url %}' }, Next: 'Hold' } as const
const hold = { Type: 'Wait', Seconds: 3600, Next: 'Download' } as const
const download = { Type: 'Task', Resource: 'app:http', Arguments: { url: '{% $link %}' }, End: true } as const

describe('definitionWarnings', () => {
  it('warns when a Wait sits between a step that fetched a value once and a state that reads it', () => {
    expect(warn({ Link: { ...link, DoNotRepeat: true }, Hold: hold, Download: download })).toEqual([
      'State "Download", field "Arguments.url": reads $link, which "Link" fetched once before the Wait "Hold": it may have expired by then',
    ])
  })

  it("warns for a step type that does not repeat its calls by default, inside a Map's items too", () => {
    const each = { Type: 'Map', Items: '{% [1] %}', ItemProcessor: { StartAt: 'Download', States: { Download: download } }, End: true } as const
    expect(warn({ Link: link, Hold: { ...hold, Next: 'Each' }, Each: each }, ['app:http'])).toEqual([
      'State "Each/Download", field "Arguments.url": reads $link, which "Link" fetched once before the Wait "Hold": it may have expired by then',
    ])
  })

  it('says nothing of a read before the Wait, of a step that is done again, or of a step marked to repeat', () => {
    expect(warn({ Link: { ...link, DoNotRepeat: true, Next: 'Download' }, Download: { ...download, End: undefined, Next: 'Hold' }, Hold: { ...hold, Next: undefined, End: true } })).toEqual([])
    expect(warn({ Link: link, Hold: hold, Download: download })).toEqual([])
    expect(warn({ Link: { ...link, DoNotRepeat: false }, Hold: hold, Download: download }, ['app:http'])).toEqual([])
  })
})
