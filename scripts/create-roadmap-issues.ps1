param(
  [string]$Repository = "ItumelengMadumo/EasyInsure",
  [string]$Manifest = "Docs/roadmap-issues.csv"
)

$ErrorActionPreference = "Stop"
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI is required. Install it, run 'gh auth login', then rerun this script."
}
if (-not (Test-Path -LiteralPath $Manifest)) { throw "Roadmap manifest not found: $Manifest" }

$items = Import-Csv -LiteralPath $Manifest
foreach ($item in $items) {
  $title = "$($item.id): $($item.title)"
  $existing = gh issue list --repo $Repository --state all --search "`"$($item.id)`" in:title" --json number,title |
    ConvertFrom-Json | Where-Object { $_.title -like "$($item.id):*" } | Select-Object -First 1
  if ($existing) {
    Write-Host "Exists: #$($existing.number) $title"
    continue
  }
  $body = @"
## Outcome

$($item.title)

## Delivery

- Priority: $($item.priority)
- Domain: $($item.domain)
- Branch: ``$($item.branch)``
- Base branch: ``dev``
- Promotion: ``dev → Staging → main``

## Acceptance

- [ ] Observable persona behavior is documented and implemented.
- [ ] Permitted and forbidden roles are tested.
- [ ] Loading, empty, error, and access-denied states are handled.
- [ ] ``npm run verify`` passes.
- [ ] Migration, monitoring, security, and rollback notes are included in the PR.

See ``Docs/PLATFORM_ROADMAP.md`` for roadmap context.
"@
  gh issue create --repo $Repository --title $title --body $body `
    --label "type:feature" --label "priority:$($item.priority.ToLower())" --label "status:ready"
}

Write-Host "Roadmap issue synchronization complete."
