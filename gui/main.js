const { app, BrowserWindow, ipcMain } = require("electron")
const { execSync, spawn } = require("child_process")
const fs = require("fs")
const path = require("path")
const os = require("os")

// Load config (same logic as CLI)
const candidates = [
  path.join(process.cwd(), "dev.config.json"),
  path.join(__dirname, "..", "dev.config.json"),
  path.join(os.homedir(), ".devup", "dev.config.json"),
]
const configPath = candidates.find((p) => fs.existsSync(p))
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
const baseDir = path.resolve(config.baseDir.replace("~", os.homedir()))

// Track running processes
const running = {}

function checkTool(tool) {
  try {
    execSync(`where ${tool.cmd}`, { stdio: "ignore" })
    return true
  } catch {
    try {
      const out = execSync(`winget list --id ${tool.winget} --accept-source-agreements`, { encoding: "utf-8" })
      return out.includes(tool.winget)
    } catch {
      return false
    }
  }
}

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 600,
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
ipcMain.handle("get-data", () => {
  const tools = (config.tools || []).map((t) => ({
    name: t.name,
    installed: checkTool(t),
  }))

  const repos = config.repos.map((r) => {
    const logoPath = r.logo ? path.join(baseDir, r.name, r.logo) : null
    return {
      name: r.name,
      run: r.run || null,
      cloned: fs.existsSync(path.join(baseDir, r.name, ".git")),
      running: !!running[r.name],
      logo: logoPath && fs.existsSync(logoPath) ? logoPath : null,
    }
  })

  return { tools, repos }
})

ipcMain.handle("run-project", (_, name) => {
  const repo = config.repos.find((r) => r.name === name)
  if (!repo || !repo.run) return { ok: false, error: "No run command" }

  if (running[name]) return { ok: false, error: "Already running" }

  const target = path.join(baseDir, repo.name)
  const child = spawn("cmd.exe", ["/c", repo.run], {
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
  try {
    const devupPath = path.join(__dirname, "..", "devup.js")
    execSync(`node "${devupPath}"`, { stdio: "ignore" })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
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
