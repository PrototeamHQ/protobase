const signals = ['SIGTERM', 'SIGINT'] as const

// The first SIGTERM or SIGINT closes the server, then exits with 0. A failing close stays an unhandled rejection.
export const closeOnSignals = (close: () => Promise<void>, exit: (code: number) => void = (code) => process.exit(code)) => {
  const shutdown = () => {
    signals.forEach((signal) => process.off(signal, shutdown))
    void close().then(() => exit(0))
  }
  signals.forEach((signal) => process.on(signal, shutdown))
}
