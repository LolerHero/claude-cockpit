import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'

import { plan } from '../setup.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SETUP = join(here, '..', 'setup.mjs')
const FIXTURE = JSON.parse(readFileSync(join(here, 'fixtures', 'settings.json'), 'utf8'))
// Paths as this platform writes them: on Linux and macOS the plugin-dir separator is `:`, which a
// drive letter would split.
const WIN = process.platform === 'win32'
const REPO = WIN ? 'E:/Coding/Projects/claude-cockpit' : '/home/me/claude-cockpit'
const OTHER = WIN ? 'C:/other/mod' : '/opt/other/mod'
const NODE = 'E:/nvm4w/nodejs/node.exe'
const base = () => ({ settings: structuredClone(FIXTURE), keybindings: null, repo: REPO, node: NODE, flags: {} })

test('a fresh settings file gets the status line, the plugin dir and the keybinding', () => {
  const { settings, keybindings, lines } = plan(base())
  assert.deepEqual(settings.statusLine, { type: 'command', command: `"${NODE}" "${REPO}/statusline/statusline.mjs"` })
  assert.equal(settings.env.CLAUDE_CODE_PLUGIN_DIRS, REPO)
  assert.equal(settings.env.SOME_OTHER, '1') // untouched
  assert.deepEqual(settings.permissions, FIXTURE.permissions) // untouched
  assert.deepEqual(keybindings.bindings, [{ context: 'Chat', bindings: { 'ctrl+x f': 'command:files' } }])
  assert.ok(lines.some(l => l.startsWith('changed: statusLine')))
  assert.ok(lines.some(l => l.startsWith('changed: env.CLAUDE_CODE_PLUGIN_DIRS')))
  assert.ok(lines.some(l => l.startsWith('changed: keybinding ctrl+x f')))
})

test('an existing plugin dir list is extended with the platform separator, once', () => {
  const b = base()
  b.settings.env.CLAUDE_CODE_PLUGIN_DIRS = OTHER
  const first = plan(b)
  assert.equal(first.settings.env.CLAUDE_CODE_PLUGIN_DIRS, `${OTHER}${delimiter}${REPO}`)
  const again = plan({ ...b, settings: first.settings })
  assert.equal(again.settings.env.CLAUDE_CODE_PLUGIN_DIRS, `${OTHER}${delimiter}${REPO}`)
  assert.ok(again.lines.some(l => l.startsWith('kept: env.CLAUDE_CODE_PLUGIN_DIRS')))
})

test('a foreign statusLine is kept unless --force', () => {
  const b = base()
  b.settings.statusLine = { type: 'command', command: 'node C:/me/my-line.js' }
  const kept = plan(b)
  assert.equal(kept.settings.statusLine.command, 'node C:/me/my-line.js')
  assert.ok(kept.lines.some(l => l.startsWith('kept: statusLine') && l.includes('my-line.js') && l.includes('--force')))
  const forced = plan({ ...b, flags: { force: true } })
  assert.ok(forced.settings.statusLine.command.includes('statusline.mjs'))
})

test('a status line merely named statusline.mjs is not ours; ours under another node is', () => {
  const b = base()
  b.settings.statusLine = { type: 'command', command: 'node ~/.claude/statusline.mjs' }
  assert.equal(plan(b).settings.statusLine.command, 'node ~/.claude/statusline.mjs')
  b.settings.statusLine = { type: 'command', command: `"/old/node" "${REPO}/statusline/statusline.mjs"` }
  assert.equal(plan(b).settings.statusLine.command, `"${NODE}" "${REPO}/statusline/statusline.mjs"`)
})

test('palette and glyphs flags land under pluginConfigs["cockpit@inline"], where the config menu writes them; absent flags write nothing', () => {
  const none = plan(base())
  assert.equal(none.settings.pluginConfigs, undefined)
  const some = plan({ ...base(), flags: { palette: 'ansi', glyphs: 'plain' } })
  assert.deepEqual(some.settings.pluginConfigs['cockpit@inline'], { options: { palette: 'ansi', glyphs: 'plain' } })
  assert.throws(() => plan({ ...base(), flags: { palette: 'typo' } }), /palette/)
  assert.throws(() => plan({ ...base(), flags: { palette: 'toString' } }), /palette/)
  assert.throws(() => plan({ ...base(), flags: { glyphs: 'huge' } }), /glyphs/)
})

test('a chord already bound to something else is left alone and named', () => {
  const b = base()
  b.keybindings = { bindings: [{ context: 'Chat', bindings: { 'ctrl+x f': 'command:other' } }] }
  const { keybindings, lines } = plan(b)
  assert.equal(keybindings.bindings[0].bindings['ctrl+x f'], 'command:other')
  assert.ok(lines.some(l => l.startsWith('kept: keybinding ctrl+x f') && l.includes('command:other')))
})

test('--dry-run prints the plan and writes nothing; a real run backs settings up first', () => {
  const cfg = mkdtempSync(join(tmpdir(), 'cockpit-setup-'))
  writeFileSync(join(cfg, 'settings.json'), JSON.stringify(FIXTURE, null, 2))
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg }
  const dry = spawnSync(process.execPath, [SETUP, '--dry-run'], { env, encoding: 'utf8' })
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /changed: statusLine/)
  assert.deepEqual(JSON.parse(readFileSync(join(cfg, 'settings.json'), 'utf8')), FIXTURE)
  assert.ok(!existsSync(join(cfg, 'keybindings.json')))

  const real = spawnSync(process.execPath, [SETUP, '--palette', 'tokyo-night'], { env, encoding: 'utf8' })
  assert.equal(real.status, 0, real.stderr)
  const after = JSON.parse(readFileSync(join(cfg, 'settings.json'), 'utf8'))
  assert.ok(after.statusLine.command.includes('statusline.mjs'))
  assert.equal(after.pluginConfigs['cockpit@inline'].options.palette, 'tokyo-night')
  assert.ok(readdirSync(cfg).some(f => f.startsWith('settings.json.bak-')), 'a backup exists')
  assert.ok(existsSync(join(cfg, 'keybindings.json')))
  assert.match(real.stdout, /restart claude/i)
})

test('a settings.json that is not JSON is refused, not overwritten', () => {
  const cfg = mkdtempSync(join(tmpdir(), 'cockpit-setup-'))
  writeFileSync(join(cfg, 'settings.json'), '{ not json')
  const r = spawnSync(process.execPath, [SETUP], { env: { ...process.env, CLAUDE_CONFIG_DIR: cfg }, encoding: 'utf8' })
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /settings\.json/)
  assert.equal(readFileSync(join(cfg, 'settings.json'), 'utf8'), '{ not json')
})

test('no settings.json at all is created from {}', () => {
  const cfg = mkdtempSync(join(tmpdir(), 'cockpit-setup-'))
  const r = spawnSync(process.execPath, [SETUP], { env: { ...process.env, CLAUDE_CONFIG_DIR: cfg }, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const s = JSON.parse(readFileSync(join(cfg, 'settings.json'), 'utf8'))
  assert.ok(s.statusLine)
})
