import { text } from './messages'

/** Where the "Runs on Protobase" note links to: the home page, with no tracking parameters. */
export const runsOnUrl = 'https://protobase.net/'

/**
 * The one line a host can have the sign-in page end on (`PROTOBASE_RUNS_ON_NOTE=true`): plain muted text in the app's
 * own font, the whole line a link to Protobase in the same tab, underlined on hover and focus, at least 24px tall to tap.
 */
export const RunsOnNote = () => (
  <footer className="mt-8 text-center">
    <a href={runsOnUrl} rel="nofollow noreferrer" className="inline-block text-sm font-normal leading-6 text-muted-foreground no-underline hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      {text('runsOnProtobase')}
    </a>
  </footer>
)
