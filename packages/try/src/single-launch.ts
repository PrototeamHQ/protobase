// One launcher per home folder: a second one would share the first one's download, database and app, and stop them when
// it exits. The launcher owns a named pipe named after the folder, from before it reads its settings until it has
// stopped everything. Only one process can own a pipe name, and Windows frees it when that process ends, however it
// ends, so a killed launcher leaves nothing to clean up.
import { createHash } from 'node:crypto'
import { createServer } from 'node:net'

/** The pipe that stands for `home`: the same folder, however its letters are cased, gives the same pipe. */
export const homePipe = (home: string) => `\\\\.\\pipe\\protobase-try-${createHash('sha256').update(home.toLowerCase()).digest('hex').slice(0, 24)}`

/** Takes `address` for this process, or fails when another launcher owns it; resolves to the release. */
export const holdHome = (address: string, home: string) =>
  new Promise<() => void>((resolve, reject) => {
    // Nothing talks to the pipe: a connection is closed at once.
    const server = createServer((socket) => socket.destroy())
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') reject(new Error(`Protobase already runs from ${home}: use its window, or stop it first`))
      else reject(error)
    })
    server.listen(address, () => {
      server.unref()
      resolve(() => server.close())
    })
  })
