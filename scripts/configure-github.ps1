param(
  [string]$Repository = "ItumelengMadumo/EasyInsure"
)

$ErrorActionPreference = "Stop"
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI is required. Install it, run 'gh auth login', then rerun this script."
}
gh auth status

$labels = @(
  @("type:feature", "1D76DB", "User-facing capability"),
  @("type:defect", "D73A4A", "Defect or regression"),
  @("type:operations", "5319E7", "Infrastructure and delivery"),
  @("type:security", "B60205", "Security hardening"),
  @("priority:p0", "B60205", "Immediate reliability"),
  @("priority:p1", "D97706", "Complete operating model"),
  @("priority:p2", "0E8A16", "Governance and scale"),
  @("status:triage", "FBCA04", "Requires triage"),
  @("status:ready", "0E8A16", "Ready for implementation"),
  @("risk:high", "B60205", "High-risk change"),
  @("release:skip", "EDEDED", "Exclude from release notes")
)
foreach ($label in $labels) {
  gh label create $label[0] --repo $Repository --color $label[1] --description $label[2] --force
}

foreach ($environment in @("Development", "Staging", "Production")) {
  "{}" | gh api --method PUT "repos/$Repository/environments/$environment" --input -
}

$requiredChecks = @("Verify", "Dependency review", "Secret scan")
function Set-Protection([string]$Branch, [int]$Approvals) {
  $payload = @{
    required_status_checks = @{ strict = $true; contexts = $requiredChecks }
    enforce_admins = $true
    required_pull_request_reviews = @{
      dismiss_stale_reviews = $true
      require_code_owner_reviews = $true
      required_approving_review_count = $Approvals
      require_last_push_approval = $true
    }
    restrictions = $null
    required_conversation_resolution = $true
    allow_force_pushes = $false
    allow_deletions = $false
    required_linear_history = $false
    block_creations = $false
  } | ConvertTo-Json -Depth 8
  $temporary = New-TemporaryFile
  try {
    Set-Content -LiteralPath $temporary.FullName -Value $payload -Encoding utf8
    gh api --method PUT "repos/$Repository/branches/$Branch/protection" --input $temporary.FullName
  } finally {
    Remove-Item -LiteralPath $temporary.FullName -Force
  }
}

Set-Protection "dev" 1
Set-Protection "Staging" 0
Set-Protection "main" 1

gh api --method PATCH "repos/$Repository" -f allow_squash_merge=true -f allow_merge_commit=true `
  -f allow_rebase_merge=false -f delete_branch_on_merge=true -f allow_auto_merge=true

Write-Host "GitHub labels, environments, merge policy, and branch protection configured for $Repository."
