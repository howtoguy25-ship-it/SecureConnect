# One-command deploy: pulls the latest code, builds the web app, and deploys it to
# Firebase Hosting. Stops immediately and prints a clear error if any step fails, instead
# of quietly continuing and deploying stale code (which is what happened when `git pull`
# failed but the build/deploy ran anyway on the old files already on disk).
#
# Usage: open PowerShell in the project folder and run:  .\deploy.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Fail($message) {
    Write-Host ""
    Write-Host "DEPLOY FAILED: $message" -ForegroundColor Red
    Write-Host "Nothing further was run. Paste this whole output to Claude for help." -ForegroundColor Red
    exit 1
}

Write-Host "==> Discarding local changes to lockfiles/package.json (these should only ever come from git, never hand-edited)" -ForegroundColor Cyan
git checkout -- package.json package-lock.json web/package.json web/package-lock.json 2>$null

Write-Host "==> Pulling latest code" -ForegroundColor Cyan
git pull origin claude/waze-emergency-alert-app-yfgto7
if ($LASTEXITCODE -ne 0) { Fail "git pull failed (see the error above) -- the site was NOT redeployed." }

Write-Host "==> Installing web dependencies" -ForegroundColor Cyan
Set-Location "$PSScriptRoot\web"
npm install
if ($LASTEXITCODE -ne 0) { Fail "npm install failed." }

Write-Host "==> Building the web app" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Fail "npm run build failed -- the site was NOT redeployed." }

Write-Host "==> Deploying to Firebase Hosting + Firestore rules" -ForegroundColor Cyan
Set-Location $PSScriptRoot
npx firebase-tools deploy --project fleettrack-9f894 --only hosting,firestore:rules
if ($LASTEXITCODE -ne 0) { Fail "firebase deploy failed (see the error above)." }

Write-Host ""
Write-Host "DEPLOY SUCCESSFUL -- both https://tracklinemaps.com and https://fleettrack-9f894.web.app are now up to date (same site, same files, two addresses)." -ForegroundColor Green
