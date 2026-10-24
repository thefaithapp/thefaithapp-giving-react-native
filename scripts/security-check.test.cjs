const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const script = path.join(__dirname, 'security-check.cjs')
const advisory = 'https://github.com/advisories/GHSA-86w9-cpqp-85rv'

function run(report) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'tfa-security-audit-'))
  try {
    fs.writeFileSync(path.join(bin, 'npm'),
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(report))})\n`,
      { mode: 0o755 })
    return spawnSync(process.execPath, [script], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    })
  } finally { fs.rmSync(bin, { recursive: true, force: true }) }
}
function report(nodes = ['node_modules/node-forge']) {
  return {
    metadata: { vulnerabilities: { high: 1 } },
    vulnerabilities: {
      'node-forge': { nodes, via: [{ url: advisory, severity: 'high' }] },
    },
  }
}
const posix = { skip: process.platform === 'win32' }

test('accepts only the exact advisory after checking the installed backport', posix, () => {
  const result = run(report())
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /verified local backport/)
})
test('blocks a new advisory alongside the backported issue', posix, () => {
  const fixture = report()
  fixture.vulnerabilities.other = {
    nodes: ['node_modules/other'],
    via: [{ url: 'https://example.test/new-advisory', severity: 'high' }],
  }
  assert.notEqual(run(fixture).status, 0)
})
test('blocks an unverified nested copy of node-forge', posix, () => {
  assert.notEqual(run(report(['node_modules/unknown/node_modules/node-forge'])).status, 0)
})
test('blocks missing or failed audit data', posix, () => {
  assert.notEqual(run({ error: { code: 'NETWORK_ERROR' } }).status, 0)
})
test('rejects a modified backport and restores the local fixture', () => {
  const file = path.join(root, 'node_modules/node-forge/lib/rsa.js')
  const source = fs.readFileSync(file)
  try {
    fs.appendFileSync(file, '\n// Tampered test fixture\n')
    const result = spawnSync(process.execPath, [script, '--prepare-only'], {
      cwd: root, encoding: 'utf8',
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Unexpected node-forge source/)
  } finally { fs.writeFileSync(file, source) }
})
