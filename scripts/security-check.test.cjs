const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const script = path.join(__dirname, 'security-check.cjs')
const installedForge = path.join(root, 'node_modules/node-forge')
const posix = { skip: process.platform === 'win32' }

function copyForge(destination) {
  fs.mkdirSync(destination, { recursive: true })
  fs.copyFileSync(path.join(installedForge, 'package.json'), path.join(destination, 'package.json'))
  fs.cpSync(path.join(installedForge, 'lib'), path.join(destination, 'lib'), { recursive: true })
}

// Each test gets independent dependency sources. Never modify the real install.
function fixture(check) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tfa-security-check-'))
  try {
    fs.mkdirSync(path.join(directory, 'scripts'))
    fs.copyFileSync(script, path.join(directory, 'scripts/security-check.cjs'))
    copyForge(path.join(directory, 'node_modules/node-forge'))
    return check(directory)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
}

function run(directory, options = {}) {
  const bin = path.join(directory, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, 'npm'),
    `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(options.stdout ?? JSON.stringify(options.report ?? cleanReport()))})\nprocess.exit(${options.status ?? 0})\n`,
    { mode: 0o755 })
  return spawnSync(process.execPath, [path.join(directory, 'scripts/security-check.cjs'),
    ...(options.prepare ? ['--prepare-only'] : [])], {
    cwd: directory, encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  })
}

function cleanReport() {
  return {
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
    vulnerabilities: {},
  }
}

function advisoryReport(name, severity, via) {
  const report = cleanReport()
  report.metadata.vulnerabilities[severity] = 1
  report.metadata.vulnerabilities.total = 1
  report.vulnerabilities[name] = {
    severity, nodes: [`node_modules/${name}`], via,
  }
  return report
}

function rejects(result, message) {
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`)
  if (message) assert.match(result.stderr, message)
}

test('accepts upstream Forge after real valid and malformed signature regressions and a clean audit', posix, () => {
  fixture((directory) => {
    const result = run(directory)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Verified upstream node-forge 1\.4\.3 source and signature regressions/)
    assert.match(result.stdout, /no dependency advisories/)
  })
})

test('prepare verifies upstream sources without changing them', () => {
  fixture((directory) => {
    const file = path.join(directory, 'node_modules/node-forge/lib/rsa.js')
    const original = fs.readFileSync(file)
    const result = run(directory, { prepare: true })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(fs.readFileSync(file), original)
    assert.doesNotMatch(result.stdout, /Audit passed/)
  })
})

for (const [name, severity, url] of [
  ['node-forge', 'high', 'https://github.com/advisories/GHSA-86w9-cpqp-85rv'],
  ['deepmerge', 'low', 'https://github.com/advisories/GHSA-gcqx-w48m-w2h4'],
  ['glob', 'moderate', 'https://github.com/advisories/GHSA-3g3m-2fjr-6pw4'],
  ['minimatch', 'moderate', 'https://github.com/advisories/GHSA-g3hv-75wg-m249'],
  ['future-dependency', 'critical', 'https://example.test/new-advisory'],
]) {
  test(`blocks ${name} advisories without exceptions`, posix, () => {
    fixture((directory) => {
      const report = advisoryReport(name, severity, [{ url, severity }])
      rejects(run(directory, { report, status: 1 }), new RegExp(url))
    })
  })
}

test('blocks an indirect vulnerability even without a direct advisory object', posix, () => {
  fixture((directory) => {
    rejects(run(directory, {
      report: advisoryReport('parent', 'moderate', ['vulnerable-dependency']), status: 1,
    }), /vulnerable transitive dependency/)
  })
})

test('fails closed on missing, invalid, or failed audit output', posix, () => {
  fixture((directory) => {
    for (const options of [
      { stdout: '' },
      { stdout: 'not JSON', status: 1 },
      { report: { error: { code: 'NETWORK_ERROR' } }, status: 1 },
      { report: { vulnerabilities: {} } },
      { report: { metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} } },
      { report: { ...cleanReport(), vulnerabilities: [] } },
      { report: cleanReport(), status: 1 },
    ]) rejects(run(directory, options))
  })
})

test('fails closed on contradictory counts and malformed advisory entries', posix, () => {
  fixture((directory) => {
    const contradictory = cleanReport()
    contradictory.metadata.vulnerabilities.total = 1
    rejects(run(directory, { report: contradictory }), /counts contradict/)
    const malformed = cleanReport()
    malformed.vulnerabilities.other = { severity: 'high' }
    rejects(run(directory, { report: malformed }), /malformed advisory data/)
  })
})

test('requires the reviewed Forge dependency to be present', () => {
  fixture((directory) => {
    fs.rmSync(path.join(directory, 'node_modules/node-forge'), { recursive: true })
    rejects(run(directory, { prepare: true }), /Expected node-forge installation/)
  })
})

test('rejects an older Forge version instead of applying a backport', () => {
  fixture((directory) => {
    const file = path.join(directory, 'node_modules/node-forge/package.json')
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
    manifest.version = '1.4.0'
    fs.writeFileSync(file, JSON.stringify(manifest))
    rejects(run(directory, { prepare: true }), /Unsupported node-forge version/)
  })
})

test('rejects tampered sources despite the approved version', () => {
  fixture((directory) => {
    fs.appendFileSync(path.join(directory, 'node_modules/node-forge/lib/rsa.js'), '\n// tampered\n')
    rejects(run(directory, { prepare: true }), /Unexpected node-forge source/)
  })
})

test('rejects a forged manifest redirecting the approved version to another implementation', () => {
  fixture((directory) => {
    const file = path.join(directory, 'node_modules/node-forge/package.json')
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
    manifest.main = 'forged.js'
    fs.writeFileSync(file, JSON.stringify(manifest))
    fs.writeFileSync(path.join(directory, 'node_modules/node-forge/forged.js'), 'module.exports = {}')
    rejects(run(directory, { prepare: true }), /Unexpected node-forge source/)
  })
})

test('verifies every installed nested copy, including scoped parents', () => {
  fixture((directory) => {
    const nested = path.join(directory, 'node_modules/@scope/parent/node_modules/node-forge')
    copyForge(nested)
    const good = run(directory, { prepare: true })
    assert.equal(good.status, 0, good.stderr)
    assert.match(good.stdout, /in 2 installation\(s\)/)
    fs.appendFileSync(path.join(nested, 'lib/rsa.js'), '\n// unverified nested copy\n')
    rejects(run(directory, { prepare: true }), /Unexpected node-forge source/)
  })
})

test('rejects an added source file that could alter module resolution', () => {
  fixture((directory) => {
    fs.writeFileSync(path.join(directory, 'node_modules/node-forge/lib/util.json'), '{}')
    rejects(run(directory, { prepare: true }), /Unexpected node-forge source/)
  })
})
