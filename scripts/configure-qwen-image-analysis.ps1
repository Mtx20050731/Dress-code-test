$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env.local"

Write-Host "Configure Alibaba Cloud Qwen image analysis (input is hidden)."
$secureKey = Read-Host "Enter DASHSCOPE_API_KEY" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ([string]::IsNullOrWhiteSpace($apiKey)) { throw "API key is empty. Nothing was written." }

  $existing = if (Test-Path -LiteralPath $envPath) { Get-Content -LiteralPath $envPath } else { @() }
  $updates = [ordered]@{
    IMAGE_ANALYSIS_PROVIDER = "qwen"
    DASHSCOPE_API_KEY = $apiKey
    QWEN_VISION_MODEL = "qwen3-vl-flash"
    QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    QWEN_VISION_INPUT_COST_PER_1M = ""
    QWEN_VISION_OUTPUT_COST_PER_1M = ""
    NEXT_PUBLIC_MOCK_MODE = "false"
  }

  $written = [Collections.Generic.HashSet[string]]::new()
  $lines = foreach ($line in $existing) {
    if ($line -match '^([A-Z_][A-Z0-9_]*)=') {
      $key = $Matches[1]
      if ($updates.Contains($key)) {
        [void]$written.Add($key)
        "$key=$($updates[$key])"
        continue
      }
    }
    $line
  }
  foreach ($key in $updates.Keys) {
    if (-not $written.Contains($key)) { $lines += "$key=$($updates[$key])" }
  }
  [IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
  Write-Host "Configured: provider=qwen, model=qwen3-vl-flash."
  Write-Host "The key was written only to local .env.local and was not displayed."
}
finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $apiKey = $null
  $secureKey = $null
}
