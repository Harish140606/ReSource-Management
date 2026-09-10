# Run this in an ELEVATED (Administrator) PowerShell.
# It temporarily trusts local connections, sets the postgres password, then restores auth.
$ErrorActionPreference = 'Stop'
$bin  = "C:\Program Files\PostgreSQL\18\bin"
$data = "C:\Program Files\PostgreSQL\18\data"
$hba  = Join-Path $data 'pg_hba.conf'
$newPassword = 'DevLocal_2026'

Copy-Item $hba "$hba.orig" -Force
@'
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
local   replication     all                                     trust
host    replication     all             127.0.0.1/32            trust
host    replication     all             ::1/128                 trust
'@ | Out-File -FilePath $hba -Encoding ascii

Restart-Service postgresql-x64-18 -Force
Start-Sleep 3
& "$bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER USER postgres PASSWORD '$newPassword';"

Copy-Item "$hba.orig" $hba -Force
Remove-Item "$hba.orig" -Force
Restart-Service postgresql-x64-18 -Force
Start-Sleep 3
Write-Host "Done. postgres password is now: $newPassword"
