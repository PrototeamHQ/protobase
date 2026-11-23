import { homedir } from 'node:os'
import path from 'node:path'

/** The user's cache folder by the platform's convention: XDG_CACHE_HOME or ~/.cache on Linux, ~/Library/Caches on macOS, LOCALAPPDATA on Windows. */
export const userCacheDir = (env: NodeJS.ProcessEnv = process.env, platform: string = process.platform, home = homedir()) => {
  if (platform === 'darwin') return path.join(home, 'Library', 'Caches')
  if (platform === 'win32') return env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
  // XDG asks for an absolute path, and to ignore a relative one.
  return env.XDG_CACHE_HOME && path.isAbsolute(env.XDG_CACHE_HOME) ? env.XDG_CACHE_HOME : path.join(home, '.cache')
}
