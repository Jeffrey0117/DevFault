# devup

Rebuild your entire dev environment with one command.

```
node devup.js
```

New machine? Run once, go grab a coffee, come back — everything's ready.

## How it works

**Phase 1: System Tools** — Checks if tools exist (`where`), installs missing ones via `winget`. Already installed = skip instantly.

**Phase 2: Repos** — Clones repos if missing, pulls if already cloned, runs `postInstall` commands.

Idempotent. Run it 100 times, same result. No wasted time.

## Quick Start

```bash
# Generate a sample config
node devup.js --init

# Edit the config
# ~/.devup/dev.config.json

# Run it
node devup.js
```

## Config

`dev.config.json` can be placed in:
1. Current directory (`./dev.config.json`)
2. Home directory (`~/.devup/dev.config.json`) — recommended

```json
{
  "baseDir": "~/workspace",
  "tools": [
    { "name": "git",    "cmd": "git",    "winget": "Git.Git" },
    { "name": "node",   "cmd": "node",   "winget": "OpenJS.NodeJS.LTS" },
    { "name": "python", "cmd": "python", "winget": "Python.Python.3.12" },
    { "name": "docker", "cmd": "docker", "winget": "Docker.DockerDesktop" }
  ],
  "repos": [
    {
      "name": "my-project",
      "url": "https://github.com/you/my-project.git",
      "branch": "main",
      "postInstall": "npm install"
    }
  ]
}
```

### Tool fields

| Field | Description |
|-------|-------------|
| `name` | Display name |
| `cmd` | Command to check existence (`where <cmd>`) |
| `winget` | winget package ID for installation |

### Repo fields

| Field | Description |
|-------|-------------|
| `name` | Folder name under `baseDir` |
| `url` | Git clone URL |
| `branch` | Branch to checkout (optional) |
| `postInstall` | Command to run after clone/pull (optional) |

## Example output

```
🔧 Phase 1: Checking system tools...

✅ git already installed, skipping
✅ node already installed, skipping
📦 Installing docker...
✅ docker installed!

🔧 All tools ready!

📂 Phase 2: Setting up repos...

📥 Cloning my-project...
⚙️  Running postInstall: npm install
✅ my-project done!

🚀 All tools & repos are ready!
```

## License

MIT
