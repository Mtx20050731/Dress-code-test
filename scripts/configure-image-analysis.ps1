param(
  [string]$Model = "gpt-4.1-mini-2025-04-14"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env.local"

Write-Host "配置真实图片分析（密钥输入不会显示）"
$secureKey = Read-Host "请输入 OpenAI 项目 API Key" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ([string]::IsNullOrWhiteSpace($apiKey)) {
    throw "未输入 API Key，配置未写入。"
  }

  $lines = @(
    "# 本机真实图片分析配置；此文件已被 .gitignore 排除。",
    "IMAGE_ANALYSIS_PROVIDER=openai",
    "OPENAI_API_KEY=$apiKey",
    "OPENAI_VISION_MODEL=$Model",
    "OPENAI_VISION_INPUT_COST_PER_1M=",
    "OPENAI_VISION_OUTPUT_COST_PER_1M=",
    "NEXT_PUBLIC_MOCK_MODE=false"
  )
  [IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
  Write-Host "配置完成：Provider=openai，Model=$Model"
  Write-Host "密钥仅写入本机 .env.local，未在屏幕显示。"
  Write-Host "如果开发网站已启动，请重启后再进行真实分析。"
}
finally {
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  $apiKey = $null
  $secureKey = $null
}
