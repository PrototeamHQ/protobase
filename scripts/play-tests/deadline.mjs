// A story whose page stops answering, such as one running a script that never yields, leaves every Playwright call on
// that page waiting, the calls' own timeouts included, since those run in the page. A timer in this process does not
// depend on the page, so it ends the wait.

/** `work`'s value, or `timedOut` once `ms` pass before `work` settles; a rejection of `work` before then rejects. */
export const withDeadline = (work, ms, timedOut) => {
  let timer
  const deadline = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, timedOut)
  })
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer))
}
