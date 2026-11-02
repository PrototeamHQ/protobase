// Waits on `promise` for at most `ms`: { done: true, value } when it settles in time, { done: false } when the time runs
// out first. A rejection in time rejects; one after the deadline is handled and dropped with the promise, so a call the
// run has given up on cannot stall or crash it.
export const deadline = (promise, ms) => {
  let timer
  const expired = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ done: false }), ms)
  })
  return Promise.race([promise.then((value) => ({ done: true, value })), expired]).finally(() => clearTimeout(timer))
}
