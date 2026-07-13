const { app, BrowserWindow, ipcMain } = require("electron")
const { execSync, spawn, exec: execCb } = require("child_process")
const { promisify } = require("util")
const fs = require("fs")
const path = require("path")
const os = require("os")

const exec = promisify(execCb)
const { detect } = require("zerosetup/lib/detect")

// Load config (same logic as CLI)
const candidates = [
  process.env.DEVFAULT_CONFIG,
  path.join(process.cwd(), "dev.config.json"),
  path.join(__dirname, "..", "dev.config.json"),
  path.join(os.homedir(), ".devfault", "dev.config.json"),
].filter(Boolean)
const configPath = candidates.find((p) => fs.existsSync(p))
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
const baseDir = path.resolve(config.baseDir.replace("~", os.homedir()))

// Extract repo name from config entry (same logic as CLI)
function repoName(repo) {
  if (repo.name) return repo.name
  const match = repo.url.match(/\/([^/]+?)(\.git)?$/)
  return match ? match[1] : repo.url
}

// Auto-detect run command (same logic as CLI)
function smartDetect(repoPath) {
  try {
    return detect(repoPath)
  } catch {
    return null
  }
}

function getRunCmd(detected, repo, repoPath) {
  if (repo.run) return repo.run

  // Check if zerosetup's detected command actually works
  if (detected && detected.startCmd) {
    const match = detected.startCmd.match(/^node\s+(.+)$/)
    if (match) {
      const target = path.join(repoPath, match[1])
      // Skip if file doesn't exist (unbuilt dist-electron/)
      // Skip if project uses electron - "node main.js" won't work, need "npm run dev"
      const hasElectron = fs.existsSync(path.join(repoPath, "node_modules", "electron"))
      if (!fs.existsSync(target) || hasElectron) {
        // Fall through to package.json scripts
      } else {
        return detected.startCmd
      }
    } else {
      return detected.startCmd
    }
  }

  // Fallback: read package.json scripts directly
  try {
    const pkgPath = path.join(repoPath, "package.json")
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
      const scripts = pkg.scripts || {}
      if (scripts.dev) return "npm run dev"
      if (scripts.start) return "npm start"
    }
  } catch {}

  return null
}

// Track running processes
const running = {}

// Cache tool check results (tools don't change during a session)
let toolsCache = null

async function checkTool(tool) {
  // 1. Check PATH
  try {
    await exec(`where ${tool.cmd}`)
    return true
  } catch {}

  // 2. Check common install locations (e.g. Python not in PATH)
  const localProgs = path.join(os.homedir(), "AppData", "Local", "Programs")
  const commonPaths = [
    path.join(localProgs, "Python", "**", `${tool.cmd}.exe`),
    path.join("C:", "Program Files", "**", `${tool.cmd}.exe`),
  ]
  for (const pattern of commonPaths) {
    // Simple glob: check known versioned dirs
    const base = path.dirname(pattern).replace("**", "")
    if (fs.existsSync(base)) {
      try {
        const entries = fs.readdirSync(base)
        for (const entry of entries) {
          const candidate = path.join(base, entry, `${tool.cmd}.exe`)
          if (fs.existsSync(candidate)) return true
        }
      } catch {}
    }
  }

  // 3. Check winget
  try {
    const { stdout } = await exec(`winget list --id ${tool.winget} --accept-source-agreements`)
    return stdout.includes(tool.winget)
  } catch {
    return false
  }
}

async function getTools() {
  if (!toolsCache) {
    const tools = config.tools || []
    toolsCache = await Promise.all(
      tools.map(async (t) => ({
        name: t.name,
        installed: await checkTool(t),
      }))
    )
  }
  return toolsCache
}

function getToolNames() {
  return (config.tools || []).map((t) => t.name)
}

function getRepos() {
  return config.repos.map((r) => {
    const name = repoName(r)
    const repoPath = path.join(baseDir, name)
    const cloned = fs.existsSync(path.join(repoPath, ".git"))
    const detected = cloned ? smartDetect(repoPath) : null
    const run = getRunCmd(detected, r, repoPath)
    const logoPath = r.logo ? path.join(repoPath, r.logo) : null
    return {
      name,
      run,
      cloned,
      running: !!running[name],
      logo: logoPath && fs.existsSync(logoPath) ? logoPath : null,
    }
  })
}

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 520,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })
  mainWindow.setMenuBarVisibility(false)
  mainWindow.loadFile(path.join(__dirname, "index.html"))
}

// IPC handlers
ipcMain.handle("get-data", async () => {
  return { tools: await getTools(), repos: getRepos() }
})

ipcMain.handle("get-repos", () => {
  return getRepos()
})

ipcMain.handle("get-tool-names", () => {
  return getToolNames()
})

ipcMain.handle("get-tools", async () => {
  return await getTools()
})

ipcMain.handle("refresh-tools", async () => {
  toolsCache = null
  return await getTools()
})

ipcMain.handle("run-project", (_, name) => {
  const repo = config.repos.find((r) => repoName(r) === name)
  if (!repo) return { ok: false, error: "Repo not found" }

  const target = path.join(baseDir, name)
  const detected = smartDetect(target)
  const runCmd = getRunCmd(detected, repo, target)
  if (!runCmd) return { ok: false, error: "No run command" }

  if (running[name]) return { ok: false, error: "Already running" }

  const child = spawn("cmd.exe", ["/c", runCmd], {
    cwd: target,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  running[name] = child

  let stdoutLog = ""
  let stderrLog = ""
  child.stdout.on("data", (d) => { stdoutLog += d.toString() })
  child.stderr.on("data", (d) => { stderrLog += d.toString() })

  child.on("exit", (code) => {
    delete running[name]
    if (code !== 0 && code !== null) {
      console.error(`[${name}] exited with code ${code}`)
      if (stdoutLog) console.error(`[${name}] stdout: ${stdoutLog}`)
      if (stderrLog) console.error(`[${name}] stderr: ${stderrLog}`)
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("status-changed")
    }
  })

  return { ok: true }
})

ipcMain.handle("stop-project", (_, name) => {
  if (!running[name]) return { ok: false }
  try {
    execSync(`taskkill /PID ${running[name].pid} /T /F`, { stdio: "ignore" })
  } catch {}
  delete running[name]
  return { ok: true }
})

ipcMain.handle("sync-all", () => {
  return new Promise((resolve) => {
    const devfaultPath = path.join(__dirname, "..", "devfault.js")
    const child = spawn("node", [devfaultPath], {
      cwd: path.join(__dirname, ".."),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })

    child.stdout.on("data", (data) => {
      const lines = data.toString().split("\n").filter((l) => l.trim())
      for (const line of lines) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("sync-progress", line)
        }
      }
    })

    child.stderr.on("data", (data) => {
      const lines = data.toString().split("\n").filter((l) => l.trim())
      for (const line of lines) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("sync-progress", line)
        }
      }
    })

    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ ok: true })
      } else {
        resolve({ ok: false, error: `Process exited with code ${code}` })
      }
    })

    child.on("error", (err) => {
      resolve({ ok: false, error: err.message })
    })
  })
})

app.whenReady().then(createWindow)
app.on("window-all-closed", () => {
  for (const name of Object.keys(running)) {
    try {
      execSync(`taskkill /PID ${running[name].pid} /T /F`, { stdio: "ignore" })
    } catch {}
  }
  app.quit()
})
