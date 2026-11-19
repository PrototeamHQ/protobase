/**
 * The shell's boot, from the page's navigation to `createRoot`, kept as it goes and, when the host asks for it with
 * `window.protobaseBootTrace = true` before the app's script runs (Protobase's official app in its debug builds), shown
 * in a small toast once the UI is ready and logged, so a phone shows where its start goes. Every time is from the
 * navigation's start, the page's `performance` clock.
 */
type Step = { name: string; at: number; took?: number; note?: string }

const steps: Step[] = []
const ms = (value: number) => Math.round(value)

/** A moment of the boot. */
export const bootMark = (name: string, note?: string) => {
  steps.push({ name, at: performance.now(), ...(note && { note }) })
}

/** A step of the boot that takes time: from when it starts to when `work` settles. */
export const bootStep = async <T>(name: string, work: Promise<T>, note?: (value: T) => string | undefined): Promise<T> => {
  const start = performance.now()
  const value = await work
  const said = note?.(value)
  steps.push({ name, at: performance.now(), took: performance.now() - start, ...(said && { note: said }) })
  return value
}

/** What the browser tells of the page itself: the HTML served and parsed, and each start module fetched. */
const pageSteps = (): Step[] => {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  const page: Step[] = navigation
    ? [
        { name: 'html served', at: navigation.responseEnd, took: navigation.responseEnd - navigation.requestStart },
        { name: 'html parsed', at: navigation.domInteractive },
      ]
    : []
  const modules = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .filter((entry) => /\/assets\/.*\.(js|css)$/.test(new URL(entry.name).pathname) && entry.responseEnd <= (steps.find((step) => step.name === 'createRoot')?.at ?? Infinity))
    .map((entry) => ({ name: new URL(entry.name).pathname.split('/').pop()!.replace(/-[\w-]{8}\./, '.'), at: entry.responseEnd, took: entry.responseEnd - entry.startTime, note: entry.transferSize === 0 ? 'cached' : `${Math.round(entry.transferSize / 1024)} kB` }))
  return [...page, ...modules]
}

/** The boot so far, in time order, as lines. */
export const bootLines = () =>
  [...pageSteps(), ...steps]
    .sort((a, b) => a.at - b.at)
    .map((step) => `${String(ms(step.at)).padStart(5)} ${step.name}${step.took !== undefined ? ` (${ms(step.took)})` : ''}${step.note ? ` ${step.note}` : ''}`)

/** Whether the host asked for the boot to be shown (`window.protobaseBootTrace`). */
export const bootTraced = () => (globalThis as { protobaseBootTrace?: unknown }).protobaseBootTrace === true

/**
 * When the host asked for it: logs the boot, keeps the last ten in local storage (`protobase:boot-traces`), and shows it
 * in a toast that a tap or six seconds takes away.
 */
export const showBootTrace = () => {
  if (!bootTraced()) return
  const created = steps.find((step) => step.name === 'createRoot')
  const lines = [...bootLines(), `total to createRoot: ${created ? ms(created.at) : '?'} ms`]
  console.info(`[boot] ${location.pathname}\n${lines.join('\n')}`)
  try {
    const kept = JSON.parse(localStorage.getItem('protobase:boot-traces') ?? '[]') as unknown[]
    localStorage.setItem('protobase:boot-traces', JSON.stringify([{ at: new Date().toISOString(), path: location.pathname, lines }, ...kept].slice(0, 10)))
  } catch {
    // A trace is not worth a failure
  }
  const toast = document.createElement('pre')
  toast.textContent = lines.join('\n')
  toast.style.cssText =
    'position:fixed;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:2147483647;margin:0;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.82);color:#fff;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;max-height:60vh;overflow:auto;-webkit-user-select:text'
  toast.addEventListener('click', () => toast.remove())
  document.body.append(toast)
  setTimeout(() => toast.remove(), 6000)
}
