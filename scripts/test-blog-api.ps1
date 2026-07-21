<#
.SYNOPSIS
  Testa POST /api/blog/posts (criação de rascunho via robô/IA).

.EXAMPLE
  $env:BLOG_API_BASE = "https://papele-educa.vercel.app"
  $env:BLOG_API_KEY = "sua-chave"
  .\scripts\test-blog-api.ps1
#>

$ErrorActionPreference = 'Stop'

$base = ($env:BLOG_API_BASE -replace '/$', '')
if (-not $base) { $base = 'https://papele-educa.vercel.app' }
$key = $env:BLOG_API_KEY
if (-not $key) {
  Write-Error 'Defina BLOG_API_KEY no ambiente.'
  exit 1
}

$endpoint = "$base/api/blog/posts"
$failed = 0

function Assert-Status {
  param($Name, $Response, $Expected)
  $code = [int]$Response.StatusCode
  if ($Expected -contains $code) {
    Write-Host "OK  $Name -> HTTP $code"
  } else {
    Write-Host "FAIL $Name -> HTTP $code (esperado: $($Expected -join '/'))"
    script:$failed++
  }
}

Write-Host "Testando $endpoint"
Write-Host ""

# 1) Sem chave
try {
  $r = Invoke-WebRequest -Uri $endpoint -Method POST -ContentType 'application/json' -Body '{"title":"x","content_html":"<p>y</p>"}' -UseBasicParsing
  Assert-Status 'Sem chave' $r @(401)
} catch {
  $code = [int]$_.Exception.Response.StatusCode
  if ($code -eq 401) { Write-Host "OK  Sem chave -> HTTP 401" }
  else { Write-Host "FAIL Sem chave -> HTTP $code"; $failed++ }
}

# 2) Chave inválida
try {
  $r = Invoke-WebRequest -Uri $endpoint -Method POST -Headers @{ 'X-API-Key' = 'chave-invalida' } -ContentType 'application/json' -Body '{"title":"x","content_html":"<p>y</p>"}' -UseBasicParsing
  Assert-Status 'Chave inválida' $r @(401)
} catch {
  $code = [int]$_.Exception.Response.StatusCode
  if ($code -eq 401) { Write-Host "OK  Chave inválida -> HTTP 401" }
  else { Write-Host "FAIL Chave inválida -> HTTP $code"; $failed++ }
}

# 3) POST válido (força draft mesmo com status published)
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$body = @{
  title = "[TESTE SCRIPT] Post API $stamp"
  content_html = '<p>Post criado pelo scripts/test-blog-api.ps1. Deve permanecer em rascunho.</p>'
  excerpt = 'Teste automatizado da API'
  status = 'published'
  tags = @('teste-api')
  category = 'Educação Infantil'
} | ConvertTo-Json

try {
  $r = Invoke-WebRequest -Uri $endpoint -Method POST -Headers @{ 'X-API-Key' = $key } -ContentType 'application/json; charset=utf-8' -Body $body -UseBasicParsing
  Assert-Status 'POST válido' $r @(200, 201)
  $json = $r.Content | ConvertFrom-Json
  if ($json.status -ne 'draft') {
    Write-Host "FAIL Status retornado foi '$($json.status)' (esperado: draft)"
    $failed++
  } else {
    Write-Host "OK  status=draft id=$($json.id) slug=$($json.slug)"
  }
  if ($json.admin_url) {
    Write-Host "Admin: $base$($json.admin_url)"
  }
} catch {
  Write-Host "FAIL POST válido -> $($_.Exception.Message)"
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
  $failed++
}

Write-Host ""
if ($failed -gt 0) {
  Write-Host "Falhou com $failed erro(s)."
  exit 1
}
Write-Host "Todos os testes passaram."
exit 0
