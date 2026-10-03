import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(here, '..', 'statusline', 'statusline.mjs')
const PAYLOAD = JSON.parse(readFileSync(join(here, 'fixtures', 'payload.json'), 'utf8'))

const ANSI = /\x1b\[[0-9;]*m/g
const visible = s => s.replace(ANSI, '').length

/** One run: a fresh config dir with the given settings and status file, cwd outside any repo. */
function run({ columns, palette, glyphs, status = {}, settings, payload = PAYLOAD }) {
  const dir = mkdtempSync(join(tmpdir(), 'cockpit-'))
  const work = join(dir, 'work')
  mkdirSync(work)
  const cfg = join(dir, 'claude')
  mkdirSync(cfg)
  if (settings !== 'missing') {
    writeFileSync(
      join(cfg, 'settings.json'),
      settings === 'garbage' ? '{ not json' : JSON.stringify({ pluginConfigs: { cockpit: { palette, glyphs } } }),
    )
  }
  writeFileSync(join(cfg, 'cockpit-status.json'), JSON.stringify({ columns, files: 3, ...status }))
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg }
  delete env.WEZTERM_PANE
  const p = { ...payload, cwd: work, workspace: { current_dir: work, project_dir: work } }
  const r = spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(p), env, cwd: work, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout
}

test('at 144 columns everything is drawn and the row fits the budget', () => {
  const out = run({ columns: 144 })
  const plain = out.replace(ANSI, '')
  assert.ok(visible(out) <= 140, `width ${visible(out)}`)
  assert.match(plain, /Opus 5\.5/)
  assert.match(plain, /work/) // the directory name
  assert.match(plain, /▪{5}/) // the context bar, five cells
  assert.match(plain, / 3/) // nerd file glyph + count
  assert.match(plain, / 1h 20m/) // nerd clock glyph + elapsed
  assert.ok(!/\n/.test(out), 'one line, no newline')
})

test('at 30 columns the model and directory drop first; bar, files and clock survive', () => {
  // The full row is 42 cells (left 23 + 3 + right 16), so 60 columns still fit everything;
  // 30 gives a budget of 26: model (prio 1) goes, then the directory (2), and 24 fits.
  const out = run({ columns: 30 })
  const plain = out.replace(ANSI, '')
  assert.ok(visible(out) <= 26, `width ${visible(out)}`)
  assert.doesNotMatch(plain, /Opus 5\.5/)
  assert.doesNotMatch(plain, /work/)
  assert.match(plain, /▪{5}/)
  assert.match(plain, / 3/)
  assert.match(plain, /1h 20m/)
})

test('a width too small for anything still draws without throwing and never wraps', () => {
  const out = run({ columns: 12 })
  assert.ok(visible(out) <= 8, `width ${visible(out)}`)
  assert.ok(!/\n/.test(out))
})

test('plain glyphs use words', () => {
  const plain = run({ columns: 144, glyphs: 'plain' }).replace(ANSI, '')
  assert.match(plain, /files 3/)
  assert.match(plain, /1h 20m/)
  assert.doesNotMatch(plain, /[-]/)
})

test('each palette paints with its own codes; ansi uses 16-color codes only', () => {
  const rose = run({ columns: 144, palette: 'rose-pine' })
  const cat = run({ columns: 144, palette: 'catppuccin-mocha' })
  const tokyo = run({ columns: 144, palette: 'tokyo-night' })
  const ansi = run({ columns: 144, palette: 'ansi' })
  assert.match(rose, /\x1b\[38;2;144;140;170m/) // #908caa subtle
  assert.match(cat, /\x1b\[38;2;166;173;200m/) // #a6adc8 subtext0
  assert.match(tokyo, /\x1b\[38;2;169;177;214m/) // #a9b1d6 fg_dark
  assert.doesNotMatch(ansi, /38;2;/)
  assert.match(ansi, /\x1b\[3[0-7]m|\x1b\[9[0-7]m/)
})

test('an unknown palette or glyph value falls back to the defaults', () => {
  const out = run({ columns: 144, palette: 'typo', glyphs: 'wat' })
  assert.match(out, /\x1b\[38;2;144;140;170m/)
  assert.match(out.replace(ANSI, ''), / 3/)
})

test('a missing or unparsable settings.json still draws', () => {
  assert.match(run({ columns: 144, settings: 'missing' }), /\x1b\[38;2;144;140;170m/)
  assert.match(run({ columns: 144, settings: 'garbage' }), /\x1b\[38;2;144;140;170m/)
})

test('a status file from the private cockpit (extra keys) only yields the file count', () => {
  const plain = run({
    columns: 144,
    status: { vps: { text: 'vps 5/5', tone: 'calm' }, obs: { text: 'obs 9', tone: 'calm' }, finance: null },
  }).replace(ANSI, '')
  assert.doesNotMatch(plain, /vps|obs/)
  assert.match(plain, / 3/)
})

test('no status file at all: width falls back to 80 and the file count is omitted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cockpit-'))
  const env = { ...process.env, CLAUDE_CONFIG_DIR: dir }
  delete env.WEZTERM_PANE
  const p = { ...PAYLOAD, cwd: dir, workspace: { current_dir: dir, project_dir: dir } }
  const r = spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(p), env, cwd: dir, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.ok(visible(r.stdout) <= 76)
  assert.doesNotMatch(r.stdout.replace(ANSI, ''), //)
})

test('an empty payload draws nothing and exits 0', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { input: '', encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'cockpit-')) } })
  assert.equal(r.status, 0, r.stderr)
})
