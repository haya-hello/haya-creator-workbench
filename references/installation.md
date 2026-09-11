# Installation

Clone this repository, then copy or link the root into the Codex skills directory as `haya-creator-workbench`. The optional module Skills under `modules/` can also be copied into the same skills directory.

Install runtime dependencies:

```powershell
.\scripts\Install-Dependencies.ps1
```

The installer keeps third-party repositories in `.vendor/`, installs the Remotion runtime in `runtime/remotion`, and does not create account sessions. Platform login is a separate user-authorized step.

Initialize a creator workspace:

```powershell
.\scripts\Initialize-Workbench.ps1 -WorkspaceRoot "D:\creator-workspace" -AccountSlug "my-account"
```
