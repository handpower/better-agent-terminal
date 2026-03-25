/**
 * Unit tests for electron/node-resolver.ts
 *
 * Run: npx tsx tests/node-resolver.test.ts
 */

import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Import the functions we want to test
import {
  compareVersions,
  findLatestInVersionedDir,
  resolveNodePath,
  getNodeExecutable,
  getExtraNodePaths,
  _resetCache,
} from '../electron/node-resolver'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ❌ ${name}`)
    console.log(`     ${(e as Error).message}`)
    failed++
  }
}

// === compareVersions ===
console.log('\ncompareVersions:')

test('equal versions', () => {
  assert.strictEqual(compareVersions('v1.0.0', 'v1.0.0'), 0)
})

test('major version difference', () => {
  assert.ok(compareVersions('v20.0.0', 'v18.0.0') > 0)
  assert.ok(compareVersions('v18.0.0', 'v20.0.0') < 0)
})

test('minor version difference', () => {
  assert.ok(compareVersions('v20.19.0', 'v20.1.0') > 0)
  assert.ok(compareVersions('v20.1.0', 'v20.19.0') < 0)
})

test('patch version difference', () => {
  assert.ok(compareVersions('v20.19.3', 'v20.19.1') > 0)
})

test('v9 vs v20 (string sort would fail)', () => {
  assert.ok(compareVersions('v20.0.0', 'v9.0.0') > 0)
})

test('without v prefix', () => {
  assert.ok(compareVersions('20.0.0', '18.0.0') > 0)
})

test('mixed v prefix', () => {
  assert.ok(compareVersions('v20.0.0', '18.0.0') > 0)
})

test('sorting an array of versions', () => {
  const versions = ['v9.0.0', 'v20.19.3', 'v18.17.0', 'v20.1.0', 'v14.21.3']
  versions.sort(compareVersions)
  assert.deepStrictEqual(versions, ['v9.0.0', 'v14.21.3', 'v18.17.0', 'v20.1.0', 'v20.19.3'])
})

// === findLatestInVersionedDir ===
console.log('\nfindLatestInVersionedDir:')

test('returns null for non-existent directory', () => {
  assert.strictEqual(findLatestInVersionedDir('/nonexistent/path', 'bin/node'), null)
})

test('finds node in nvm directory (if installed)', () => {
  const nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node')
  const result = findLatestInVersionedDir(nvmDir, 'bin/node')
  if (fs.existsSync(nvmDir)) {
    assert.ok(result !== null, 'should find node in nvm directory')
    assert.ok(result!.endsWith('/bin/node'), `should end with /bin/node, got ${result}`)
    assert.ok(fs.existsSync(result!), `resolved path should exist: ${result}`)
  } else {
    assert.strictEqual(result, null, 'should return null when nvm not installed')
  }
})

test('returns null for empty directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-resolver-test-'))
  try {
    assert.strictEqual(findLatestInVersionedDir(tmpDir, 'bin/node'), null)
  } finally {
    fs.rmdirSync(tmpDir)
  }
})

test('picks latest version from multiple', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-resolver-test-'))
  try {
    // Create fake version directories with node binaries
    for (const v of ['v14.0.0', 'v20.19.3', 'v18.17.0', 'v9.0.0']) {
      const binDir = path.join(tmpDir, v, 'bin')
      fs.mkdirSync(binDir, { recursive: true })
      fs.writeFileSync(path.join(binDir, 'node'), '')  // fake binary
    }
    const result = findLatestInVersionedDir(tmpDir, 'bin/node')
    assert.ok(result !== null)
    assert.ok(result!.includes('v20.19.3'), `should pick v20.19.3, got ${result}`)
  } finally {
    fs.rmSync(tmpDir, { recursive: true })
  }
})

test('ignores non-version directories', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-resolver-test-'))
  try {
    fs.mkdirSync(path.join(tmpDir, '.cache'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'something'), { recursive: true })
    const binDir = path.join(tmpDir, 'v18.0.0', 'bin')
    fs.mkdirSync(binDir, { recursive: true })
    fs.writeFileSync(path.join(binDir, 'node'), '')
    const result = findLatestInVersionedDir(tmpDir, 'bin/node')
    assert.ok(result !== null)
    assert.ok(result!.includes('v18.0.0'))
  } finally {
    fs.rmSync(tmpDir, { recursive: true })
  }
})

// === resolveNodePath ===
console.log('\nresolveNodePath:')

test('returns a valid path', () => {
  const result = resolveNodePath()
  assert.ok(result.length > 0, 'should return non-empty string')
  if (result !== 'node') {
    assert.ok(fs.existsSync(result), `resolved path should exist: ${result}`)
  }
})

test('resolved path is actually node', () => {
  const result = resolveNodePath()
  if (result !== 'node') {
    assert.ok(
      result.endsWith('/node') || result.endsWith('\\node.exe'),
      `should end with node binary name, got ${result}`
    )
  }
})

// === getNodeExecutable (lazy cache) ===
console.log('\ngetNodeExecutable (lazy cache):')

test('returns same result on multiple calls', () => {
  _resetCache()
  const first = getNodeExecutable()
  const second = getNodeExecutable()
  assert.strictEqual(first, second, 'should return cached result')
})

test('reset cache allows re-resolution', () => {
  const first = getNodeExecutable()
  _resetCache()
  const second = getNodeExecutable()
  // Should resolve to same path (environment hasn't changed)
  assert.strictEqual(first, second)
})

// === getExtraNodePaths ===
console.log('\ngetExtraNodePaths:')

test('returns an array', () => {
  const result = getExtraNodePaths()
  assert.ok(Array.isArray(result))
})

test('all returned paths are directories', () => {
  const result = getExtraNodePaths()
  for (const p of result) {
    assert.ok(fs.existsSync(p), `path should exist: ${p}`)
    assert.ok(fs.statSync(p).isDirectory(), `should be a directory: ${p}`)
  }
})

// === Summary ===
console.log(`\n${'='.repeat(40)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
