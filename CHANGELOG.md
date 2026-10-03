# Changelog

Each release names the Claude Code build it was tested against: the plugin hooks API is young,
so pin the tag that matches your build (`git clone --branch v0.1.0 …`).

## v0.1.0 — 2026-10-04

Tested against Claude Code 2.1.288.

- Status line: model, directory, branch (dirty, ahead/behind, lines added and removed), a
  five-cell context bar, the file count and the session clock. Segments drop by priority so the
  row never wraps; width from wezterm, else the mod's measurement, else 80.
- `/files` pane (`ctrl+x f`): the documents, images and archives this session wrote or produced,
  newest first. Arrows or Tab move, Enter or a key (`1`–`9`, `a`–`z`) opens, Esc closes. A PNG is
  drawn inline in kitty and Ghostty.
- Four palettes (`rose-pine`, `catppuccin-mocha`, `tokyo-night`, `ansi`) and two glyph sets,
  chosen in Claude Code's config menu.
- `setup.mjs` wires the status line, the plugin folder and the keybinding, with `--dry-run`,
  `--force` and a backup of `settings.json`.
- One status file per session (`~/.claude/cockpit/<session id>.json`).
