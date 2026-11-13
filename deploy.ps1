# ====================================================================
# SCRIPT DE DEPLOY AUTOMATICO EN GOOGLE CLOUD RUN
# ====================================================================

# 1. Leer variables del archivo .env local
if (Test-Path .env) {
    Write-Host "Leyendo variables de entorno del archivo .env..." -ForegroundColor Cyan
    $envContent = Get-Content .env -Raw
    
    # Extraer variables con Regex
    $supabaseUrl = [regex]::Match($envContent, 'VITE_SUPABASE_URL\s*=\s*(.*)').Groups[1].Value.Trim("`"' ")
    $supabaseKey = [regex]::Match($envContent, 'VITE_SUPABASE_ANON_KEY\s*=\s*(.*)').Groups[1].Value.Trim("`"' ")
} else {
    Write-Error "No se encontro el archivo .env en la raiz del proyecto. Cancelando deploy."
    exit
}

if (-not $supabaseUrl -or -not $supabaseKey) {
    Write-Error "Faltan variables obligatorias en el .env (VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY)."
    exit
}

# 2. Obtener y asegurar cuenta y Project ID en gcloud
Write-Host "Asegurando cuenta y proyecto en Google Cloud..." -ForegroundColor Yellow
gcloud config set account pablomgomez21@gmail.com
gcloud config set project hair-501912
$account = "pablomgomez21@gmail.com"
$projectId = "hair-501912"

Write-Host "Iniciando despliegue de Nunki en Cloud Run..." -ForegroundColor Green
Write-Host "Cuenta GCP activa: $account" -ForegroundColor Cyan
Write-Host "ID Proyecto GCP: $projectId" -ForegroundColor Yellow
Write-Host "URL Supabase: $supabaseUrl" -ForegroundColor Gray

# 3. Compilar la imagen usando Cloud Build
Write-Host "Paso 1/2: Compilando contenedor en Google Cloud Build..." -ForegroundColor Cyan

# Quoting the entire substitutions argument prevents PowerShell from breaking on commas
$subs = "--substitutions=_VITE_SUPABASE_URL=$supabaseUrl,_VITE_SUPABASE_ANON_KEY=$supabaseKey"

gcloud builds submit --config cloudbuild.yaml $subs

if ($LASTEXITCODE -ne 0) {
    Write-Error "Error durante la compilacion en Google Cloud Build."
    exit
}

# 4. Desplegar en Google Cloud Run
Write-Host "Paso 2/2: Desplegando en Google Cloud Run..." -ForegroundColor Cyan
gcloud run deploy nunki-app `
  --image="gcr.io/$projectId/nunki-app" `
  --platform="managed" `
  --region="us-central1" `
  --allow-unauthenticated

if ($LASTEXITCODE -ne 0) {
    Write-Error "Error al desplegar la aplicacion en Cloud Run."
    exit
}

Write-Host "Despliegue finalizado con exito!" -ForegroundColor Green
