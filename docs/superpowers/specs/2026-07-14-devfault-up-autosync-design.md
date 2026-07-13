# DevFault `up` + autosync — 零記憶自動同步設計

日期:2026-07-14

## 問題

DevFault 理論上一鍵重建環境,實際上沒有任何機器在用。根因(使用者訪談):

1. **D — 想不起來**:換機器當下不會想到它。
2. **A — bootstrap 懶**:「裝一個工具來幫我裝工具」第一步就放棄。
3. **給錯東西**:clone repo + npm install 給的是原始碼目錄;使用者要的是
   「我的所有 app(DuckShot、SpeakSlow、RePic、ReVid…)每台機器都裝好、
   隨開隨用、永遠最新版」。

## 解法核心

DevFault 不再是「需要被記得的工具」,變成「裝一次、之後隱形」的常駐同步器:

- Bootstrap 騎在使用者唯一真實儀式上(`myclaudeset/install.sh`)。
- 裝完自動註冊登入排程,背景保持所有東西最新。
- 有打包 Release 的 app 直接靜默安裝成品(NSIS `/S`),不 clone 原始碼。

## 變更

### 1. Config schema:repo 新增 `dist: "release"`

- `dist: "release"` = 這個 repo 以打包 app 形式發佈:
  - `up` / full setup 時抓 GitHub Releases 最新版 `Setup*.exe`,`/S` 靜默安裝。
  - **不主動 clone** 原始碼;但若本機已有 clone(開發機),照樣 `git pull`。
- 沒有 `dist` = 原本行為(clone/pull + smart-install)。

已安裝版本記在 `~/.devfault/apps.json`(`{ name: tag }`),同 tag 跳過。

### 2. 新命令 `devfault up [--auto]`

無互動全同步,給排程跑:

0. Config 自我更新:config 在 git repo 內 → `git pull` 後重讀。
1. Tools:缺的 winget 裝(同現有 Phase 1)。
2. Repos(非 release):clone 缺的(+裝依賴);已有的 pull,
   **HEAD 有變才重裝依賴**(登入時跑要輕)。
3. Repos(release):本機有 clone 才 pull(只 pull 不裝依賴)。
4. Apps:對每個 `dist:"release"` repo 查最新 release
   (`gh api` 優先、public API fallback),tag 沒變跳過;
   變了下載 `Setup*.exe`(排除 `.blockmap`)→ `start /wait <exe> /S` → 記錄 tag。

`--auto`:距上次成功 run < 6 小時直接靜默退出(`~/.devfault/state.json`),
避免每次登入都全量跑。

### 3. 新命令 `devfault autosync [off]`

- 產生 `~/.devfault/devfault-up.vbs`(wscript 隱藏視窗跑
  `cmd /c devfault up --auto >> ~/.devfault/logs/up.log 2>&1`)。
- 註冊 `HKCU\...\CurrentVersion\Run` key(免系統管理員權限,每次登入觸發)。
- `off` 移除 Run key。

### 4. Config 內容補齊

- 新增 `DuckShot`、`SpeakSlow`(`dist:"release"`)。
- `RePic`、`ReVid`、`Screenshot-OCR` 標 `dist:"release"`。
- 新增 `DevFault` repo 本身(讓新機器拿到可 git pull 的 config)。

### 5. Config 查找補 fallback

第 4 順位:npm 套件自帶的 `dev.config.json`(跟著 `npm i -g github:...` 走)。
解決新機器「還沒 clone 任何東西就要 config」的雞生蛋問題。

### 6. `myclaudeset/install.sh` 收尾自動化

原本裝完 DevFault 只印「自己去跑」;改成:

1. `devfault`(full setup,前景跑給使用者看)
2. `setx DEVFAULT_CONFIG <baseDir>/DevFault/dev.config.json`(之後 config 走 git 自我更新)
3. `devfault autosync`

## 非目標(本輪不做)

- GUI 改動(release app 裝完自帶開始選單捷徑,不需 GUI 代勞)。
- source 專案的開始選單捷徑。
- macOS / Linux 排程(`autosync` Windows-only,其他平台印提示)。
- 每個 repo 加 CI 打包(方案 2,過度工程)。

## 風險

- 靜默安裝會關掉執行中的同名 app(NSIS 行為)→ 可接受,更新本來就要重啟。
- `--auto` 在無網路時 pull 全失敗 → 每 repo try/catch,照舊繼續,不炸。
- winget 在背景排程觸發安裝理論上可能跳 UAC → tools 極少變動,實務罕見。
