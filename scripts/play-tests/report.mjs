// Each story's line prints as soon as it finishes, so a run the job's timeout cuts off still shows how far it got.

/** The PASS or FAIL line of one story, with its id and error on a failure and how long it took. */
export const reportLine = (story, error, ms) => {
  const seconds = `${(ms / 1000).toFixed(1)} s`
  if (!error) return `PASS ${story.title} / ${story.name} (${seconds})`
  return `FAIL ${story.title} / ${story.name} (${story.id}, ${seconds})\n  ${error.name}: ${error.message}`
}
