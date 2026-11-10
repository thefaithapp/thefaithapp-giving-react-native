// Development tooling only; excluded from published SDK archives.
// Source pin derived from the official node-forge 1.4.3 npm tarball:
// sha512-P6wzfh6t70avmV8FrVEAd/36sOPJQ+hkaJVX1Laap9J/77m7M0eyozDvc8SwnDf4P7MP94gwbAAo0rg3YVXT+g==
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const forgeVersion = '1.4.3'
const forgeSourceHash = 'a91e166de7853108680fc07af5c5c4c4ad06693991a3cf84017816a0953119e0'
const root = path.resolve(__dirname, '..')

function packageDirectories(modules, packageName, visited = new Set()) {
  if (!fs.existsSync(modules)) return []
  const real = fs.realpathSync(modules)
  if (visited.has(real)) return []
  visited.add(real)
  const found = []
  for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const directory = path.join(modules, entry.name)
    if (!entry.isDirectory() && !(entry.isSymbolicLink() && fs.statSync(directory).isDirectory())) continue
    if (entry.name.startsWith('@')) {
      found.push(...packageDirectories(directory, packageName, visited))
    } else {
      if (entry.name === packageName) found.push(directory)
      found.push(...packageDirectories(path.join(directory, 'node_modules'), packageName, visited))
    }
  }
  return found
}

function sourceFiles(directory, relative = 'lib') {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const name = `${relative}/${entry.name}`
      assert.ok(!entry.isSymbolicLink(), `Unexpected dependency source symlink: ${name}`)
      if (entry.isDirectory()) return sourceFiles(directory, name)
      assert.ok(entry.isFile(), `Unexpected dependency source entry: ${name}`)
      return [name]
    })
}

function verifyForgeSource(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
  assert.equal(manifest.version, forgeVersion, 'Unsupported node-forge version; use the reviewed upstream release')
  const hash = crypto.createHash('sha256')
  for (const file of ['package.json', ...sourceFiles(directory)].sort()) {
    hash.update(`${file}\0`)
    hash.update(fs.readFileSync(path.join(directory, file)))
    hash.update('\0')
  }
  assert.equal(hash.digest('hex'), forgeSourceHash, 'Unexpected node-forge source; refusing unverified dependency')
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

const forge = packageDirectories(path.join(root, 'node_modules'), 'node-forge')
assert.ok(forge.length > 0, 'Expected node-forge installation was not found; review security policy')
for (const directory of forge) {
  verifyForgeSource(directory)
  verifySignatures(directory)
}
console.log(`Verified upstream node-forge ${forgeVersion} source and signature regressions in ${forge.length} installation(s).`)
if (process.argv.includes('--prepare-only')) process.exit(0)

const audit = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['audit', '--package-lock-only', '--include=dev', '--include=optional', '--include=peer', '--json'], {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000,
  })
const report = JSON.parse(audit.stdout || '{}')
assert.ok(!audit.error && !audit.signal && !report.error && report.metadata && report.vulnerabilities
  && typeof report.vulnerabilities === 'object' && !Array.isArray(report.vulnerabilities),
  'Dependency audit did not return complete advisory data')
const counts = report.metadata.vulnerabilities
assert.ok(counts && ['info', 'low', 'moderate', 'high', 'critical', 'total']
  .every((severity) => Number.isSafeInteger(counts[severity]) && counts[severity] >= 0),
  'Dependency audit did not return complete vulnerability counts')
const failures = new Set()
for (const [name, entry] of Object.entries(report.vulnerabilities)) {
  assert.ok(entry && Array.isArray(entry.via), 'Dependency audit contains malformed advisory data')
  const advisories = entry.via.filter((value) => value && typeof value === 'object')
  failures.add(`${name}: ${entry.severity || 'unknown'} ${advisories.map((issue) => issue.url || 'unidentified advisory').join(', ') || 'vulnerable transitive dependency'}`)
}
if (failures.size) {
  console.error([...failures].join('\n'))
  process.exit(1)
}
assert.equal(audit.status, 0, 'Dependency audit exited unsuccessfully without complete findings')
assert.ok(Object.values(counts).every((count) => count === 0), 'Dependency audit counts contradict its advisory results')
console.log('Audit passed: no dependency advisories.')
