[CmdletBinding()]
param(
  [string] $ToolRoot,
  [string] $Python = "python",
  [switch] $SkipBrowser
)

$ErrorActionPreference = "Stop"
$repoUrl = "https://github.com/dreammis/social-auto-upload.git"

if (-not $ToolRoot) {
  $ToolRoot = Join-Path (Split-Path -Parent $PSScriptRoot) ".vendor\social-auto-upload"
}

# 中文：该安装器保持第三方工具独立，不向真人剪辑项目写入 Python 依赖。
# English: This installer keeps the third-party uploader isolated from the Remotion production project.
if (-not (Test-Path -LiteralPath $ToolRoot)) {
  git clone $repoUrl $ToolRoot
  if ($LASTEXITCODE -ne 0) {
    throw "克隆上传器失败 / Failed to clone uploader"
  }
} elseif (-not (Test-Path -LiteralPath (Join-Path $ToolRoot ".git"))) {
  throw "目标目录已存在但不是预期 Git 仓库 / Existing target is not the expected Git repository: $ToolRoot"
}

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$workspacePatches = @(
  (Join-Path $workspaceRoot "patches\social-auto-upload-manual-review.patch"),
  (Join-Path $workspaceRoot "patches\social-auto-upload-bilibili-private.patch")
)

# 中文：按固定顺序重放工作区安全补丁；已应用时保持幂等。
# English: Replay workspace safety patches in a fixed order while remaining idempotent.
Push-Location $ToolRoot
try {
  foreach ($workspacePatch in $workspacePatches) {
    if (-not (Test-Path -LiteralPath $workspacePatch)) {
      throw "缺少工作区补丁 / Missing workspace patch: $workspacePatch"
    }
    git apply --reverse --check $workspacePatch 2>$null
    if ($LASTEXITCODE -ne 0) {
      git apply --check $workspacePatch
      if ($LASTEXITCODE -ne 0) {
        throw "工作区补丁与当前上游版本不兼容 / Workspace patch is incompatible: $workspacePatch"
      }
      git apply $workspacePatch
      if ($LASTEXITCODE -ne 0) {
        throw "应用工作区补丁失败 / Failed to apply workspace patch: $workspacePatch"
      }
    }
  }
} finally {
  Pop-Location
}

& $Python --version | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "未找到可用 Python / Python executable not found: $Python"
}

& $Python -m pip install --user uv
if ($LASTEXITCODE -ne 0) {
  throw "安装 uv 失败 / Failed to install uv"
}

& $Python -m uv python install 3.12
if ($LASTEXITCODE -ne 0) {
  throw "安装 Python 3.12 失败 / Failed to install Python 3.12"
}

$venvPython = Join-Path $ToolRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) {
  & $Python -m uv venv --python 3.12 (Join-Path $ToolRoot ".venv")
  if ($LASTEXITCODE -ne 0) {
    throw "创建独立虚拟环境失败 / Failed to create isolated virtual environment"
  }
}

& $Python -m uv pip install --python $venvPython -e $ToolRoot
if ($LASTEXITCODE -ne 0) {
  throw "安装上传器主依赖失败 / Failed to install uploader dependencies"
}

# 中文：当前上游 pyproject 漏写了百家号模块导入所需的 playwright。
# English: The current upstream pyproject omits playwright, which is imported by the Baijiahao module.
& $Python -m uv pip install --python $venvPython playwright==1.52.0
if ($LASTEXITCODE -ne 0) {
  throw "补充 playwright 依赖失败 / Failed to install supplemental playwright dependency"
}

$confPath = Join-Path $ToolRoot "conf.py"
if (-not (Test-Path -LiteralPath $confPath)) {
  Copy-Item -LiteralPath (Join-Path $ToolRoot "conf.example.py") -Destination $confPath
}

if (-not $SkipBrowser) {
  # 中文：不使用当前已失效的 npmmirror 路径，直接走 Patchright 官方下载源。
  # English: Use Patchright's official download source because the documented mirror currently returns 404.
  & (Join-Path $ToolRoot ".venv\Scripts\patchright.exe") install chromium
  if ($LASTEXITCODE -ne 0) {
    throw "安装 Patchright Chromium 失败 / Failed to install Patchright Chromium"
  }
}

& (Join-Path $ToolRoot ".venv\Scripts\sau.exe") --help 2>&1 | Out-String -Width 240
