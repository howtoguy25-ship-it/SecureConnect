# One-command deploy for SiteSpark: pulls the latest code, typechecks both the app and
# Cloud Functions, builds the web app, and deploys Cloud Functions + both Hosting sites
# (buildsitespark.com + app.buildsitespark.com) to Firebase. Stops immediately and prints a
# clear error if any step fails, instead of quietly deploying stale or broken code.
#
# Usage: open PowerShell ANYWHERE and run the full path to this file, e.g.:
#   C:\path\to\SecureConnect\site-builder\deploy.ps1
# or just double-click it in File Explorer. It finds its own folder automatically via
# $PSScriptRoot, so you do NOT need to `cd site-builder` first -- this only deploys
# SiteSpark, never the unrelated project living at the repo root one level up.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Fail($message) {
    Write-Host ""
    Write-Host "DEPLOY FAILED: $message" -ForegroundColor Red
    Write-Host "Nothing further was run. Paste this whole output to Claude for help." -ForegroundColor Red
    exit 1
}

Write-Host "==> Discarding local changes to lockfiles/package.json (these should only ever come from git, never hand-edited)" -ForegroundColor Cyan
git checkout -- package.json package-lock.json firebase/functions/package.json firebase/functions/package-lock.json 2>$null

Write-Host "==> Pulling latest code" -ForegroundColor Cyan
git pull origin claude/ios-website-builder-app-2rzjrk
if ($LASTEXITCODE -ne 0) { Fail "git pull failed (see the error above) -- nothing was redeployed." }

Write-Host "==> Installing app dependencies" -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { Fail "npm install failed." }

Write-Host "==> Installing Cloud Functions dependencies" -ForegroundColor Cyan
Set-Location "$PSScriptRoot\firebase\functions"
npm install
if ($LASTEXITCODE -ne 0) { Fail "firebase/functions npm install failed." }
Set-Location $PSScriptRoot

Write-Host "==> Typechecking the app" -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { Fail "Client typecheck failed -- nothing was redeployed." }

Write-Host "==> Typechecking Cloud Functions" -ForegroundColor Cyan
Set-Location "$PSScriptRoot\firebase\functions"
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { Fail "Cloud Functions typecheck failed -- nothing was redeployed." }
Set-Location $PSScriptRoot

Write-Host "==> Building the web app" -ForegroundColor Cyan
npx expo export -p web
if ($LASTEXITCODE -ne 0) { Fail "Web build failed -- nothing was redeployed." }

Write-Host "==> Deploying Cloud Functions + Hosting to Firebase" -ForegroundColor Cyan
npx firebase-tools deploy --only functions,hosting
if ($LASTEXITCODE -ne 0) { Fail "firebase deploy failed (see the error above)." }

Write-Host ""
Write-Host "DEPLOY SUCCESSFUL -- https://buildsitespark.com and https://app.buildsitespark.com are now up to date." -ForegroundColor Green
