// Development tooling only; excluded from published SDK archives.
// Backport: digitalbazaar/forge#1152, ceba34402e329f0365134f23fe19898756527d65.
// The upstream BSD-licensed fix rejects extra nested DigestAlgorithm children.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const originalHash = 'fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50'
const before = 'obj.value.length !== 2) {'
const after = "obj.value.length !== 2 ||\n            obj.value[0].value.length !==\n              (('parameters' in capture) ? 2 : 1)) {"
const advisory = 'https://github.com/advisories/GHSA-86w9-cpqp-85rv'
const root = path.resolve(__dirname, '..')
const vetted = new Set()
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

function forgeDirectories(modules) {
  if (!fs.existsSync(modules)) return []
  const found = []
  for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const directory = path.join(modules, entry.name)
    if (entry.name.startsWith('@')) {
      found.push(...forgeDirectories(directory))
    } else {
      if (entry.name === 'node-forge') found.push(directory)
      found.push(...forgeDirectories(path.join(directory, 'node_modules')))
    }
  }
  return found
}

function verifySignatures(directory) {
  const forge = require(directory)
  // Check the vulnerable parser, using a signature over a deliberately malformed
  // DigestInfo. This is accepted by unpatched 1.4.0, despite invalid ASN.1.
  for (const exponent of [3, 65537]) {
    const key = crypto.generateKeyPairSync('rsa', {
      modulusLength: 1024,
      publicExponent: exponent,
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    })
    const privateKey = forge.pki.privateKeyFromPem(key.privateKey)
    const publicKey = forge.pki.publicKeyFromPem(key.publicKey)
    const message = 'TheFaithApp development signature regression'
    const digest = forge.md.sha256.create().update(message)
    const expected = digest.digest().getBytes()
    const valid = privateKey.sign(forge.md.sha256.create().update(message))
    assert.equal(publicKey.verify(expected, valid), true)
    assert.equal(crypto.verify('sha256', Buffer.from(message), key.publicKey,
      Buffer.from(valid, 'binary')), true)
    const a = forge.asn1
    const node = (type, constructed, value) =>
      a.create(a.Class.UNIVERSAL, type, constructed, value)
    for (const includeNull of [false, true]) {
      const algorithm = [node(a.Type.OID, false, a.oidToDer(forge.oids.sha256).getBytes())]
      if (includeNull) algorithm.push(node(a.Type.NULL, false, ''))
      algorithm.push(node(a.Type.OCTETSTRING, false, 'unconsumed garbage'))
      const malformed = a.toDer(node(a.Type.SEQUENCE, true, [
        node(a.Type.SEQUENCE, true, algorithm),
        node(a.Type.OCTETSTRING, false, expected),
      ])).getBytes()
      const signature = privateKey.sign(malformed, 'NONE')
      assert.throws(() => publicKey.verify(expected, signature), /DigestInfo/)
    }
  }
}

for (const directory of forgeDirectories(path.join(root, 'node_modules'))) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
  if (manifest.version === '1.4.0') {
    const file = path.join(directory, 'lib/rsa.js')
    const source = fs.readFileSync(file, 'utf8')
    // Derive the pristine source before validating: repeated runs must be safe,
    // and an edited or incomplete patch must never qualify for the exception.
    const pristine = source.includes(after) ? source.replace(after, before) : source
    assert.equal(sha256(pristine), originalHash, 'Unexpected node-forge source; refusing patch')
    assert.equal(pristine.split(before).length, 2, 'Ambiguous node-forge patch target')
    const patched = pristine.replace(before, after)
    if (source !== patched) fs.writeFileSync(file, patched)
    assert.equal(sha256(fs.readFileSync(file)), sha256(patched))
    vetted.add(path.relative(root, directory).split(path.sep).join('/'))
  }
  verifySignatures(directory)
}
assert.ok(vetted.size > 0, 'Expected node-forge installation was not found; review security policy')
console.log(`Verified node-forge backport and signature regressions in ${vetted.size} installation(s).`)
if (process.argv.includes('--prepare-only')) process.exit(0)

const audit = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['audit', '--package-lock-only', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
const report = JSON.parse(audit.stdout || '{}')
assert.ok(!audit.error && !report.error && report.metadata && report.vulnerabilities,
  'Dependency audit did not return complete advisory data')
const failures = new Set()
let backported = false
for (const [name, entry] of Object.entries(report.vulnerabilities)) {
  for (const issue of entry.via.filter((value) => typeof value === 'object')) {
    if (name === 'node-forge' && issue.url === advisory &&
        entry.nodes.length > 0 && entry.nodes.every((node) => vetted.has(node))) {
      backported = true
      continue
    }
    failures.add(`${name}: ${issue.severity} ${issue.url}`)
  }
}
if (failures.size) {
  console.error([...failures].join('\n'))
  process.exit(1)
}
console.log(backported
  ? 'Audit passed: the sole remaining registry advisory has a verified local backport.'
  : 'Audit passed: no dependency advisories.')
