#!/usr/bin/env node
// Wires claude-cockpit into a Claude Code install:
//   node setup.mjs [--palette <name>] [--glyphs nerd|plain] [--dry-run] [--force]
//
// 1. settings.json → statusLine runs statusline/statusline.mjs with this Node
// 2. settings.json → env.CLAUDE_CODE_PLUGIN_DIRS gains this folder (so the mod loads everywhere)
// 3. settings.json → pluginConfigs["cockpit@inline"].options.{palette,glyphs} when the flags are given
// 4. keybindings.json → ctrl+x f opens /files, unless the chord is taken
// Every change is printed as `changed: …`; everything left as is, `kept: …`. settings.json is
// backed up before the first write. The config dir is CLAUDE_CONFIG_DIR or ~/.claude.

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

import { PALETTES } from './palettes.js'

const GLYPHS = ['nerd', 'plain']
const CHORD = 'ctrl+x f'
const COMMAND = 'command:files'
// Where the config menu stores this plugin's options when it loads from a folder
// (CLAUDE_CODE_PLUGIN_DIRS): `<name>@inline`, measured on 2.1.288. Setup writes the same key.
const KEY = 'cockpit@inline'

/** Pure: the settings and keybindings after setup, plus the lines to print. Throws on a bad flag. */
export function plan({ settings, keybindings, repo, node, flags }) {
  const s = structuredClone(settings ?? {})
  const k = structuredClone(keybindings ?? { bindings: [] })
  const lines = []

  if (flags.palette !== undefined && !Object.hasOwn(PALETTES, flags.palette)) {
    throw new Error(`--palette must be one of ${Object.keys(PALETTES).join(', ')}`)
  }
  if (flags.glyphs !== undefined && !GLYPHS.includes(flags.glyphs)) {
    throw new Error(`--glyphs must be one of ${GLYPHS.join(', ')}`)
  }

  // 1. status line
  const command = `"${node}" "${repo}/statusline/statusline.mjs"`
  const current = s.statusLine?.command
  if (current === command) lines.push('kept: statusLine already points here')
  // Ours when it runs this checkout's script, under whatever node; a mere `statusline.mjs` is not.
  else if (current && !current.includes(`${repo}/statusline/statusline.mjs`) && !flags.force) {
    lines.push(`kept: statusLine is "${current}" — re-run with --force to replace it`)
  } else {
    s.statusLine = { type: 'command', command }
    lines.push(`changed: statusLine → ${command}`)
  }

  // 2. plugin dir
  s.env ??= {}
  const dirs = (s.env.CLAUDE_CODE_PLUGIN_DIRS ?? '').split(delimiter).filter(Boolean)
  if (dirs.includes(repo)) lines.push('kept: env.CLAUDE_CODE_PLUGIN_DIRS already lists this folder')
  else {
    s.env.CLAUDE_CODE_PLUGIN_DIRS = [...dirs, repo].join(delimiter)
    lines.push(`changed: env.CLAUDE_CODE_PLUGIN_DIRS → ${s.env.CLAUDE_CODE_PLUGIN_DIRS}`)
  }

  // 3. options, only when asked; the config menu in Claude Code edits the same keys
  if (flags.palette !== undefined || flags.glyphs !== undefined) {
    s.pluginConfigs ??= {}
    s.pluginConfigs[KEY] ??= {}
    s.pluginConfigs[KEY].options ??= {}
    if (flags.palette !== undefined) {
      s.pluginConfigs[KEY].options.palette = flags.palette
      lines.push(`changed: pluginConfigs["${KEY}"].options.palette → ${flags.palette}`)
    }
    if (flags.glyphs !== undefined) {
      s.pluginConfigs[KEY].options.glyphs = flags.glyphs
      lines.push(`changed: pluginConfigs["${KEY}"].options.glyphs → ${flags.glyphs}`)
    }
  }

  // 4. keybinding
  k.bindings ??= []
  const bound = k.bindings.find(b => b?.bindings && CHORD in b.bindings)
  if (bound && bound.bindings[CHORD] !== COMMAND) {
    lines.push(`kept: keybinding ${CHORD} is already "${bound.bindings[CHORD]}" — /files still works`)
  } else if (bound) lines.push(`kept: keybinding ${CHORD} already opens /files`)
  else {
    const chat = k.bindings.find(b => b?.context === 'Chat')
    if (chat) (chat.bindings ??= {})[CHORD] = COMMAND
    else k.bindings.push({ context: 'Chat', bindings: { [CHORD]: COMMAND } })
    lines.push(`changed: keybinding ${CHORD} → ${COMMAND}`)
  }

  return { settings: s, keybindings: k, lines }
}

const readJsonOrThrow = (path, missing) => {
  if (!existsSync(path)) return missing
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new Error(`${path} is not valid JSON (${err.message}); fix it by hand, nothing was written`)
  }
}

function main() {
  const { values: flags } = parseArgs({
    options: {
      palette: { type: 'string' },
      glyphs: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  })
  const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  const repo = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/')
  const node = process.execPath.replace(/\\/g, '/')
  const settingsPath = join(dir, 'settings.json')
  const keysPath = join(dir, 'keybindings.json')

  const settings = readJsonOrThrow(settingsPath, {})
  const keybindings = readJsonOrThrow(keysPath, null)
  const out = plan({ settings, keybindings, repo, node, flags })

  for (const line of out.lines) console.log(line)
  if (flags['dry-run']) return console.log('dry run: nothing written')

  if (existsSync(settingsPath)) {
    const bak = `${settingsPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
    copyFileSync(settingsPath, bak)
    console.log(`backup: ${bak}`)
  }
  writeFileSync(settingsPath, JSON.stringify(out.settings, null, 2) + '\n')
  writeFileSync(keysPath, JSON.stringify(out.keybindings, null, 2) + '\n')
  console.log('done — restart claude. Then: /files opens the pane, ctrl+x f is the hotkey.')
}

// Run only as a script, not when the tests import `plan`. Lower-cased: Windows hands the drive
// letter over in either case.
const self = fileURLToPath(import.meta.url).toLowerCase()
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === self) {
  try {
    main()
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
