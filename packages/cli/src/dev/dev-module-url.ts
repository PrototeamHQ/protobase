import { pathToFileURL } from 'node:url'

// The URL `protobase dev` imports a project file by. Vite serves absolute files under /@fs, which keeps them in the
// module graph (and so hot reloadable); a package's own file loads as it is. Vite's /@fs takes forward slashes and a
// leading slash, so a Windows path C:\app\x.ts becomes /@fs/C:/app/x.ts.
export const devModuleUrl = (file: string) => {
  const posix = file.replaceAll('\\', '/')
  if (posix.split('/').includes('node_modules')) return pathToFileURL(file).href
  return posix.startsWith('/') ? `/@fs${posix}` : `/@fs/${posix}`
}
