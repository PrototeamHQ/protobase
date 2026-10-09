export const parseHosts = (value: string | undefined) =>
  (value ?? '').split(',').map((host) => host.trim()).filter(Boolean)
