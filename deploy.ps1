# deploy.ps1
# Automates Next.js build-time variables extraction, Cloud Build compilation, and Cloud Run deployment.

# 1. Verify environment file
if (-not (Test-Path ".env.local")) {
    Write-Error ".env.local not found in the current directory! Please ensure you run this script inside the seo-engine directory."
    exit 1
}

# 2. Extract NEXT_PUBLIC_ variables from .env.local
Write-Host "Reading public environment variables from .env.local..." -ForegroundColor Cyan
$envVars = @{}
Get-Content .env.local | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line -match "^(NEXT_PUBLIC_[A-Z0-9_]+)=(.*)$") {
        $key = $Matches[1]
        $value = $Matches[2].Trim()
        # Remove any surrounding single or double quotes
        if ($value -match "^`"(.*)`"$|^'(.*)'$") {
            $value = $Matches[1] + $Matches[2]
        }
        $envVars[$key] = $value
        Write-Host "Found: $key = $value" -ForegroundColor DarkGray
    }
}

# 3. Check for core required variables
$requiredKeys = @("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
$missing = @()
foreach ($req in $requiredKeys) {
    if (-not $envVars.ContainsKey($req) -or [string]::IsNullOrEmpty($envVars[$req])) {
        $missing += $req
    }
}

if ($missing.Count -gt 0) {
    Write-Error "Missing critical variables in .env.local: $($missing -join ', ')"
    exit 1
}

# 4. Construct substitution string for Cloud Build
$subsList = @()
foreach ($key in $envVars.Keys) {
    $val = $envVars[$key]
    $subsList += "_$key=$val"
}
$substitutions = $subsList -join ","

# 5. Run Cloud Build
Write-Host "Submitting build to Google Cloud Build..." -ForegroundColor Green
Write-Host "Using command: gcloud builds submit --config=cloudbuild.yaml --substitutions=$substitutions ." -ForegroundColor DarkGray

& gcloud builds submit --config=cloudbuild.yaml --substitutions=$substitutions .

if ($LASTEXITCODE -ne 0) {
    Write-Error "Cloud Build failed!"
    exit 1
}

# 6. Deploy to Cloud Run
Write-Host "Deploying new image to Cloud Run service 'rankshoot-web' in us-central1..." -ForegroundColor Green
& gcloud run deploy rankshoot-web --image=us-central1-docker.pkg.dev/rankshoot/rankshoot-repo/app:v1 --region=us-central1

if ($LASTEXITCODE -ne 0) {
    Write-Error "Cloud Run deployment failed!"
    exit 1
}

Write-Host "Deployment completed successfully! The service is now live." -ForegroundColor Green
