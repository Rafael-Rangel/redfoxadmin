$toolsNode = Join-Path $PSScriptRoot ".tools\node"
if (Test-Path "$toolsNode\node.exe") {
  $env:Path = "$toolsNode;$env:Path"
}

Set-Location $PSScriptRoot
npm install
npx playwright install chromium
Write-Host "Dependências instaladas."
Write-Host "1) Rode migration.sql no Supabase SQL Editor"
Write-Host "2) npm run create -- --name `"Dr Nome`" --clinic `"Clinica`""
