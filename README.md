# devup

Rebuild your entire dev environment with one command.

```
devup
```

New machine? Run once, go grab a coffee, come back — everything's ready.

## How it works

**Phase 1: System Tools** — Checks if tools exist (`where`), installs missing ones via `winget`. Already installed = skip instantly.

**Phase 2: Repos** — Clones repos if missing, pulls if already cloned, runs `postInstall` commands.

Idempotent. Run it 100 times, same result. No wasted time.

## Install

```bash
npm link
```

Now `devup` is available globally.

## Usage

```bash
devup              # Full setup (install tools + clone/pull repos)
devup init         # Generate sample config at ~/.devup/
devup ls           # List all launchable projects
devup run <name>   # Launch a project (e.g. devup run RePic)
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
      "postInstall": "npm install",
      "run": "npm run dev"
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
| `run` | Command for `devup run` to launch the project (optional). Projects without `run` won't appear in `devup ls` |

## GUI

devup also comes with an Electron desktop app for visual project launching.

```bash
cd gui && npm install && npm start
```

Features:
- Tools status at a glance
- One-click Run / Stop for each project
- Sync All button to pull all repos

## Example: `devup ls`

```
可啟動的專案：

  PyClick              → python tray_clicker.py
  RePic                → npm run dev
  ReVid                → npm run dev
  ClaudeBot            → npm run dev
  CloudPipe            → npm start
  Screenshot-OCR       → npm run dev
```

## Example: `devup`

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
