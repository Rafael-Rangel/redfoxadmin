# Roda o robô Cal.com usando só a pasta do usuário (sem admin)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$nodeDir = Join-Path $root ".tools\node"

if (-not (Test-Path "$nodeDir\node.exe")) {
    Write-Host "Node portátil não encontrado. Baixando para sua pasta..."
    New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
    $zip = Join-Path $root ".tools\node.zip"
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v22.16.0/node-v22.16.0-win-x64.zip" -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath (Join-Path $root ".tools") -Force
    Rename-Item (Join-Path $root ".tools\node-v22.16.0-win-x64") $nodeDir -Force
    Remove-Item $zip -Force
}

$env:Path = "$nodeDir;$env:Path"
Set-Location $root

if (-not (Test-Path "node_modules")) {
    npm install
    npx playwright install chromium
}

if ($args.Count -eq 0) {
    Write-Host ""
    Write-Host "Uso:"
    Write-Host "  .\run.ps1 list"
    Write-Host "  .\run.ps1 intake"
    Write-Host "  .\run.ps1 create `"Dr Nome`" `"Clinica X`""
    Write-Host "  .\run.ps1 create-from intake.json"
    Write-Host ""
    Write-Host "Tudo roda em: $root"
    exit 0
}

$cmd = $args[0]
switch ($cmd) {
    "list" { node src/list-accounts.mjs }
    "intake" {
        Write-Host "Abrindo app em http://localhost:3781"
        node src/intake-server.mjs
    }
    "create-from" {
        if ($args.Count -lt 2) {
            Write-Host "Uso: .\run.ps1 create-from caminho\intake.json"
            exit 1
        }
        $configPath = $args[1].Replace("'", "''")
        $psCommand = "Write-Host '=== Robo Cal.com (config) ===' -ForegroundColor Cyan; " +
            "`$env:Path = '$nodeDir;' + `$env:Path; `$env:HEADLESS = 'false'; `$env:KEEP_BROWSER_OPEN = 'true'; " +
            "Set-Location '$root'; node src/create-account.mjs --config '$configPath'; " +
            "Write-Host ''; Write-Host 'Concluido. Enter para fechar.' -ForegroundColor Green; Read-Host"
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $psCommand
        Write-Host "Janela aberta - resolva o captcha no Chrome."
    }
    "create" {
        if ($args.Count -lt 3) {
            Write-Host "Uso: .\run.ps1 create `"Dr Nome`" `"Clinica X`""
            exit 1
        }
        $env:HEADLESS = "false"
        node src/create-account.mjs --name $args[1] --clinic $args[2]
    }
    "create-window" {
        if ($args.Count -lt 3) {
            Write-Host "Uso: .\run.ps1 create-window `"Dr Nome`" `"Clinica X`""
            exit 1
        }
        $clientName = $args[1] -replace "'", "''"
        $clinicName = $args[2] -replace "'", "''"
        $psCommand = "Write-Host '=== Robo Cal.com REDFOX ===' -ForegroundColor Cyan; " +
            "Write-Host '1) Resolva o captcha no Chrome' -ForegroundColor Yellow; " +
            "Write-Host '2) O robo verifica email e entra no painel' -ForegroundColor Yellow; " +
            "`$env:Path = '$nodeDir;' + `$env:Path; " +
            "`$env:HEADLESS = 'false'; `$env:KEEP_BROWSER_OPEN = 'true'; " +
            "Set-Location '$root'; " +
            "node src/create-account.mjs --name '$clientName' --clinic '$clinicName'; " +
            "Write-Host ''; Write-Host 'Concluido. Enter para fechar.' -ForegroundColor Green; Read-Host"
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $psCommand
        Write-Host "Janela aberta - acompanhe o Chrome e o terminal."
    }
    default {
        Write-Host "Comando desconhecido: $cmd"
        exit 1
    }
}
