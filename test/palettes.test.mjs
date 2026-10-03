import { test } from 'node:test'
import assert from 'node:assert/strict'

import { PALETTES, ROLES, DEFAULT_PALETTE, paletteOf } from '../palettes.js'

const HEX = /^#[0-9a-f]{6}$/
const NAMES = new Set(['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray'])

test('every palette names every role with a hex or an ANSI color name', () => {
  for (const [name, p] of Object.entries(PALETTES)) {
    for (const role of ROLES) {
      const v = p[role]
      assert.ok(HEX.test(v) || NAMES.has(v), `${name}.${role} = ${v}`)
    }
    assert.deepEqual(Object.keys(p).sort(), [...ROLES].sort(), `${name} has exactly the roles`)
  }
})

test('the default is rose-pine and an unknown name falls back to it', () => {
  assert.equal(DEFAULT_PALETTE, 'rose-pine')
  assert.equal(paletteOf('rose-pine'), PALETTES['rose-pine'])
  assert.equal(paletteOf('no-such'), PALETTES['rose-pine'])
  assert.equal(paletteOf(undefined), PALETTES['rose-pine'])
  assert.equal(paletteOf(42), PALETTES['rose-pine'])
  assert.equal(paletteOf('toString'), PALETTES['rose-pine']) // inherited keys are not palettes
})

test('ansi uses names only, so it never needs truecolor', () => {
  for (const v of Object.values(PALETTES.ansi)) assert.ok(NAMES.has(v), v)
})
