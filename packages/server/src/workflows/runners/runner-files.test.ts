import { describe, expect, it } from 'vitest'
import { buildReportOf } from './runner-builds'
import { jobFiles } from './runner-files'
import { installCommand, installScript } from './runner-install'

const schema = { type: 'object', properties: { video: { 'x-file': true }, poster: { 'x-file': true }, height: { type: 'integer' } } }

describe("a job's input files", () => {
  it('are the arguments its version takes as files that were given, stored files or files of the run, each at its job-scoped address', () => {
    const video = { configuration: 'videos', path: 'in/a b.mp4', name: 'a b.mp4', type: 'video/mp4', size: 54 }
    const poster = { uri: 'private:workflows/r/1?name=p.png', name: 'p.png', type: 'image/png', size: 3 }
    expect(jobFiles(schema, { video, poster, height: 720 }, '/api/runners/v1/jobs/j/inputs')).toEqual({
      files: [
        { input: 'video', name: 'a b.mp4', type: 'video/mp4', size: 54, url: '/api/runners/v1/jobs/j/inputs/video' },
        { input: 'poster', name: 'p.png', type: 'image/png', size: 3, url: '/api/runners/v1/jobs/j/inputs/poster' },
      ],
    })
    expect(jobFiles(schema, { height: 720 }, '/x')).toEqual({ files: [] })
  })

  it('fail the Task with Storage.InvalidArguments when one is no file', () => {
    expect(jobFiles(schema, { video: 'https://example.com/a.mp4' }, '/x')).toEqual({ error: 'Storage.InvalidArguments', cause: 'video is neither a stored file ({ configuration, path, name, type, size }) nor a file of the run' })
  })
})

describe("a runner's build report", () => {
  it('takes a step version, its status and, once it ended, its digest and log', () => {
    expect(buildReportOf({ step: 'custom:ocr:1', status: 'building' })).toEqual({ step: 'custom:ocr:1', status: 'building' })
    expect(buildReportOf({ step: 'custom:ocr:1', status: 'ready', digest: 'sha256:abc', log: '#1 DONE' })).toEqual({ step: 'custom:ocr:1', status: 'ready', digest: 'sha256:abc', log: '#1 DONE' })
    for (const body of [{ step: 'ocr', status: 'ready' }, { step: 'custom:ocr:1', status: 'done' }, { step: 'custom:ocr:1', status: 'failed', log: 3 }, null]) expect(buildReportOf(body)).toHaveProperty('problem')
  })
})

describe("the runners' install script", () => {
  it("installs this app's version of the runner for this app, quoting what it holds as sh words", () => {
    const script = installScript({ origin: "https://app.example.com/it's", apiPath: '/api' }, '0.15.0')
    expect(script.startsWith('#!/bin/sh\n')).toBe(true)
    expect(script).toContain("url='https://app.example.com/it'\\''s'")
    expect(script).toContain("version='0.15.0'")
    expect(script).toContain('binary_url="https://github.com/PrototeamHQ/protobase/releases/download/v${version}/protobase-runner-linux-${arch}"')
    expect(script).toContain("api_path='/api'")
    expect(script).toContain('"$runner" register --url "$url" --api-path "$api_path" --token "$token" "$@"')
    expect(script).toContain('systemctl --user enable --now protobase-runner.service')
    expect(installCommand({ origin: 'https://app.example.com', apiPath: '/api' }, 'pbr_once_abc')).toBe('curl -fsSL https://app.example.com/api/runners/install.sh | sh -s -- --token pbr_once_abc')
    expect(installCommand({ origin: 'https://app.example.com', apiPath: '/backend' }, 'pbr_once_abc')).toBe('curl -fsSL https://app.example.com/backend/runners/install.sh | sh -s -- --token pbr_once_abc')
  })
})
