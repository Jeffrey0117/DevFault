# Machine-local path overrides (`~/.devfault/local.json`)

**Date**: 2026-07-17
**Problem**: `dev.config.json` is git-synced across machines, but repos live at
different paths on each machine (e.g. main machine keeps them in
`~/Desktop/code` with renamed folders like `devup`, fresh machines use
`~/workspace`). DevFault only resolves `baseDir + repoName`, so existing local
clones show `[not cloned]`.

A per-repo `dir` field in the synced config alone can't fix this — one value
would have to be right on every machine.

## Design

New optional file, never synced: `~/.devfault/local.json`

```json
{
  "baseDir": "~/Desktop/code",
  "dirs": {
    "DevFault": "~/Desktop/code/devup",
    "RePic": "~/Desktop/code/workhub/repic"
  }
}
```

- `baseDir` (optional): overrides the synced config's `baseDir` on this machine.
- `dirs` (optional): per-repo absolute path (supports `~`), keyed by repo name
  (case-insensitive). Wins over everything.

Repo path resolution order (CLI and GUI identical):

1. `local.json` → `dirs[name]`
2. synced config repo entry → `dir` (for names that differ on *every* machine)
3. `baseDir + name` (existing behavior)

Missing `local.json` → behavior unchanged.

## Touch points

- `devfault.js`: config-load section gains `local.json` load + `expandHome()` +
  `repoDir(repo, base?)`; used by `ls`, `run`, `up`, default setup. `up`'s
  `repoBase` also honors `local.baseDir`.
- `gui/main.js`: mirrors the same load/resolve logic; `getRepos()` and
  `run-project` use `repoDir()`.
- Clone targets also go through `repoDir()` — an overridden repo clones into
  its override path.

## Out of scope

- `scan` still only walks `baseDir` (no recursion into subdirs like `workhub/`).
- `pinConfigToSyncedClone` keeps its `baseDir/DevFault` assumption (only runs
  on fresh machines running off the bundled config, where no local.json exists).
