import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { installScript } from '../src/workflows/runners/runner-install'

const run = promisify(execFile)
const folders: string[] = []
afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true })
})

// A machine for the script: `uname`, `docker`, `curl`, `systemctl`, `loginctl` and `id` as stubs that log their calls.
const machine = async ({ os = 'Linux', arch = 'x86_64', docker = 'rootless' }: { os?: string; arch?: string; docker?: 'rootless' | 'root' | 'none' } = {}) => {
  const root = await mkdtemp(path.join(tmpdir(), 'runner-install-'))
  folders.push(root)
  const stubs = path.join(root, 'stubs')
  await mkdir(stubs)
  const calls = path.join(root, 'calls')
  const stub = async (name: string, body: string) => {
    await writeFile(path.join(stubs, name), `#!/bin/sh\necho "${name} $*" >> '${calls}'\n${body}\n`)
    await chmod(path.join(stubs, name), 0o755)
  }
  await stub('uname', `case "$1" in -s) echo ${os} ;; -m) echo ${arch} ;; esac`)
  await stub('docker', docker === 'none' ? 'exit 1' : `[ "$2" = --format ] && echo '[name=seccomp${docker === 'rootless' ? ' name=rootless' : ''}]'; exit 0`)
  await stub('podman', 'exit 1')
  // The download is the runner itself: a script that logs how it was called.
  await stub('curl', `while [ $# -gt 0 ]; do [ "$1" = -o ] && out=$2; shift; done; printf '#!/bin/sh\\necho "protobase-runner $*" >> ${calls}\\n' > "$out"`)
  await stub('systemctl', 'exit 0')
  await stub('loginctl', 'echo Linger=no')
  await stub('id', 'echo lab')
  const script = path.join(root, 'install.sh')
  await writeFile(script, installScript({ origin: 'https://app.example.com', apiPath: '/backend' }, '0.15.0'))
  const env = { PATH: `${stubs}:/usr/bin:/bin`, HOME: path.join(root, 'home'), XDG_CONFIG_HOME: path.join(root, 'config') }
  const install = (...args: string[]) => run('sh', [script, ...args], { env })
  return { root, install, calls: async () => (await readFile(calls, 'utf8')).trim().split('\n'), env }
}

describe('the install script', () => {
  it('downloads the runner of the app\'s version for the platform, registers it and runs it as a systemd user unit', async () => {
    const { install, calls, env, root } = await machine()
    const { stdout, stderr } = await install('--token', 'pbr_once_abc', '--slots', '2', '--work-dir', "/srv/it's jobs", '--cleaner-image', 'mirror.example.com/busybox:1.37.0')
    const made = await calls()
    expect(made).toContain(`curl -fsSL https://github.com/PrototeamHQ/protobase/releases/download/v0.15.0/protobase-runner-linux-x64 -o ${env.HOME}/.local/bin/protobase-runner.download`)
    expect(made).toContain("protobase-runner register --url https://app.example.com --api-path /backend --token pbr_once_abc --slots 2 --work-dir /srv/it's jobs --cleaner-image mirror.example.com/busybox:1.37.0")
    expect(made).toEqual(expect.arrayContaining(['systemctl --user daemon-reload', 'systemctl --user enable --now protobase-runner.service']))
    const unit = await readFile(path.join(root, 'config', 'systemd', 'user', 'protobase-runner.service'), 'utf8')
    expect(unit).toContain(`ExecStart=${env.HOME}/.local/bin/protobase-runner run`)
    expect(unit).toContain('WantedBy=default.target')
    expect(unit).toContain('TimeoutStopSec=120')
    expect(stdout).toContain('Installed and started')
    // Rootless Docker needs no advice, but lingering does
    expect(stderr).not.toContain('rootless')
    expect(stderr).toContain('loginctl enable-linger lab')
  })

  it('leaves the service to the user with --service false, from another address and binary', async () => {
    const { install, calls, root } = await machine({ arch: 'aarch64', docker: 'root' })
    const { stdout, stderr } = await install('--token', 'pbr_once_abc', '--url', 'http://127.0.0.1:3000', '--binary-url', 'file:///tmp/runner', '--bin-dir', path.join(root, 'bin'), '--service', 'false')
    const made = await calls()
    expect(made).toContain(`curl -fsSL file:///tmp/runner -o ${root}/bin/protobase-runner.download`)
    expect(made).toContain('protobase-runner register --url http://127.0.0.1:3000 --api-path /backend --token pbr_once_abc')
    expect(made.some((call) => call.startsWith('systemctl'))).toBe(false)
    expect(stdout).toContain(`Start it with: ${root}/bin/protobase-runner run`)
    expect(stderr).toContain('rootless Docker is recommended')
  })

  it('refuses without a token, off Linux, on another CPU, without an engine, or with --service other than true or false', async () => {
    const refusals: [Parameters<typeof machine>[0], string[], string][] = [
      [{}, [], 'give the runner\'s one-time registration token'],
      [{ os: 'Darwin' }, ['--token', 't'], 'the runner runs on Linux only, not Darwin'],
      [{ arch: 'riscv64' }, ['--token', 't'], 'no runner is built for riscv64'],
      [{ docker: 'none' }, ['--token', 't'], 'neither docker nor podman works for lab'],
      [{}, ['--token', 't', '--service', 'yes'], '--service is true or false'],
      [{}, ['--token', 't', '--gpu', 'true'], 'unknown option --gpu'],
    ]
    for (const [given, args, refusal] of refusals) {
      const { install } = await machine(given)
      await expect(install(...args)).rejects.toMatchObject({ stderr: expect.stringContaining(refusal) })
    }
  })
})
