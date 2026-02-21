const { app, BrowserWindow, ipcMain } = require("electron")
const { execSync, spawn, exec: execCb } = require("child_process")
const { promisify } = require("util")
const fs = require("fs")
const path = require("path")
const os = require("os")

const exec = promisify(execCb)

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

// Cache tool check results (tools don't change during a session)
let toolsCache = null

async function checkTool(tool) {
  try {
    await exec(`where ${tool.cmd}`)
    return true
  } catch {
    try {
      const { stdout } = await exec(`winget list --id ${tool.winget} --accept-source-agreements`)
      return stdout.includes(tool.winget)
    } catch {
      return false
    }
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
    const logoPath = r.logo ? path.join(baseDir, r.name, r.logo) : null
    return {
      name: r.name,
      run: r.run || null,
      cloned: fs.existsSync(path.join(baseDir, r.name, ".git")),
      running: !!running[r.name],
      logo: logoPath && fs.existsSync(logoPath) ? logoPath : null,
    }
  })
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
  return new Promise((resolve) => {
    const devupPath = path.join(__dirname, "..", "devup.js")
    const child = spawn("node", [devupPath], {
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
