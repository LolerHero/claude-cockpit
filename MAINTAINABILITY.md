# Maintainability — claude-cockpit

Scored against the standard 10-category rubric (total /50) so the project stays handoff-ready.
Buyer-ready threshold: 42 / 50 with no category below 3. Re-score after any significant change.

## Rubric

| # | Category | Anchors |
|---|---|---|
| 1 | **Onboarding documentation** | 1=README absent or one line. 3=README + setup + run, but operational context (architecture, why) lives elsewhere. 5=README + arch overview + setup script + first-PR walkthrough; a new dev is productive in a day. |
| 2 | **Inline code documentation** | 1=no comments, naming-only. 3=top-of-file purpose comments on non-trivial modules. 5=non-obvious WHYs documented at every load-bearing decision; comments age with the code. |
| 3 | **Test coverage of critical paths** | 1=no tests / scaffolding only. 3=schemas + a handful of pure functions covered. 5=Server Actions, schemas, interactive components, and a11y all covered with a CI gate. |
| 4 | **Type safety** | 1=`any` widespread / loose unknown. 3=mostly typed but some escape hatches. 5=`tsc --noEmit` clean, no `any`, DB types regenerated on every schema change. |
| 5 | **Architectural consistency** | 1=mixed patterns per concern (some Server Actions, some inline fetches, some route handlers). 3=conventions exist but not enforced. 5=one clear pattern per concern, documented and adhered to. |
| 6 | **Dependency hygiene** | 1=stale majors, abandoned packages, peer-dep warnings ignored. 3=current most majors, occasional `--legacy-peer-deps`, lockfile committed. 5=current majors, no peer-dep warnings, security alerts addressed, lockfile committed, no abandoned packages. |
| 7 | **Database migration discipline** | 1=ad-hoc SQL changes. 3=numbered migrations but applied inconsistently. 5=numbered migrations only, applied via tooling, types regenerated, RLS on every table from day one. |
| 8 | **Configuration & secrets** | 1=hardcoded secrets / no `.env.example`. 3=`.env.example` exists but drifts. 5=`.env.example` complete and current, no secrets committed, prod config + ops steps documented. |
| 9 | **Build & deploy reproducibility** | 1=manual / tribal knowledge. 3=one-command build but deploy is bespoke. 5=one-command build + one-command deploy, scripts committed, runbook documented. |
| 10 | **Error handling & observability** | 1=throws everywhere, silent swallowing. 3=consistent in some layers. 5=typed result unions everywhere, structured logs with context, no silent swallowing. |

---


## Current scoring

*Scored 2026-10-03, at 0.1.0; re-scored 2026-10-04 after CI (category 3).*

| # | Category | Score | Why |
|---|---|---|---|
| 1 | Onboarding documentation | 4 | README covers install, palettes and how it works; a setup script wires everything. No first-change walkthrough. |
| 2 | Inline code documentation | 4 | Every module opens with its purpose; the non-obvious choices (Windows path escaping, why `$.env`, the drop order) carry their reason. |
| 3 | Test coverage of critical paths | 4 | Palettes, the status line (width, palettes, glyphs, bad input, per-session status), setup (pure plan + real runs) and the pane (drawing, collection, counts, the dialog's rows) are covered, gated by CI on Linux, macOS and Windows plus the plugin tests on the pinned engine. Hotkey presses and the opener are not. |
| 4 | Type safety | 3 | The mod is typed against the engine's laid types; `tsc` still reports a handful of build-specific errors (tool matcher union depth, an index access). `palettes.js` carries a `.d.ts`. |
| 5 | Architectural consistency | 4 | One pattern per concern: the mod owns engine state, the status line reads one JSON file, both share one palette table. |
| 6 | Dependency hygiene | 5 | No dependencies. Node's own test runner. |
| 7 | Database migration discipline | 5 | No database. |
| 8 | Configuration & secrets | 5 | Nothing secret. The two options live in the manifest's `userConfig` and Claude Code's config menu; setup writes the same keys. |
| 9 | Build & deploy reproducibility | 4 | Nothing to build; one command installs (`node setup.mjs`), with a dry run and a backup. No release process or tags yet. |
| 10 | Error handling & observability | 3 | The status line swallows on purpose (a throwing status line goes blank) and degrades segment by segment; setup refuses a settings.json it cannot parse; the pane toasts a failed open. No logging. |
| | **Total** | **41 / 50** | One below the 42 threshold; see targets. |

## Next-move targets

1. **Test the pane's presses** — a press on a hotkey runs the opener, and a non-zero exit toasts. Moves 4 → 5.
2. **A release tag** (`v0.1.0`) and a CHANGELOG line per release, so a user can pin a version against a Claude Code build. Moves 9 → 5.
