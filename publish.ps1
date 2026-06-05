# Publicar no GitHub (rafael-rangel/rafael) e Vercel
# Rode no PowerShell a partir da pasta rafael/

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$git = if (Get-Command git -ErrorAction SilentlyContinue) { "git" } else { "$env:TEMP\MinGit\cmd\git.exe" }
$gh = if (Get-Command gh -ErrorAction SilentlyContinue) { "gh" } else { "$env:TEMP\gh-cli\bin\gh.exe" }

Write-Host "=== 1. Login GitHub ===" -ForegroundColor Cyan
& $gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
  & $gh auth login -h github.com -p https -w
}

Write-Host "`n=== 2. Criar repo (se ainda nao existir) ===" -ForegroundColor Cyan
& $gh repo view rafael-rangel/rafael 2>$null
if ($LASTEXITCODE -ne 0) {
  & $gh repo create rafael-rangel/rafael --public --source=. --remote=origin --push
} else {
  & $git push -u origin main
}

Write-Host "`n=== 3. Vercel ===" -ForegroundColor Cyan
Write-Host "Importe em https://vercel.com/new"
Write-Host "  Repo: rafael-rangel/rafael"
Write-Host "  Root Directory: calcom-bot"
Write-Host "  Env vars: copie de .env.example (valores do seu .env local)"
Write-Host ""
Write-Host "Ou, com Vercel CLI:" -ForegroundColor Yellow
Write-Host "  cd calcom-bot"
Write-Host "  npx vercel --prod"
