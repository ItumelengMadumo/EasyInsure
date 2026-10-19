import { COMPANY, COOLING_OFF } from './company';
import { money, shortDate } from './format';
import type { Asset, Claim, Policy } from '../types';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

/** The printable policy schedule: everything the client agreed to, in one page they can save as a PDF. */
export function scheduleHtml(policy: Policy, asset: Asset | undefined, holder: string, claims: Claim[]) {
  const rows: [string, string][] = [
    ['Policy number', policy.policyNumber], ['Policy holder', holder], ['Insured asset', asset?.description ?? 'Insured asset'],
    ['Cover starts', shortDate(policy.startDate)], ['Cover ends', shortDate(policy.endDate)], ['Duration', `${policy.durationMonths} months`],
    ['Monthly premium', policy.approvedPremium ? money.format(policy.approvedPremium) : '—'],
    ['Cover limit', policy.coverLimit ? money.format(policy.coverLimit) : 'As per the accepted quote'],
    ['Excess (you pay first on a claim)', policy.excess != null ? money.format(policy.excess) : 'As per the accepted quote'],
    ['Policy wording version', policy.wordingVersion ?? '—'],
  ];
  const exclusions = policy.exclusions?.length ? policy.exclusions.map((item) => `<li>${esc(item)}</li>`).join('') : '<li>None recorded on this schedule</li>';
  const history = claims.length ? claims.map((claim) => `<li>${esc(claim.claimNumber)} · ${esc(claim.claimType.replaceAll('_', ' '))} · ${esc(claim.status.replaceAll('_', ' ').toLowerCase())}</li>`).join('') : '<li>No claims on this policy</li>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Policy schedule ${esc(policy.policyNumber)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;color:#10283c;max-width:720px;margin:32px auto;padding:0 24px}h1{margin:0 0 4px}h2{margin:28px 0 8px;font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:#08766d}table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid #dce5e4;vertical-align:top}td:first-child{color:#52666f;width:42%}.note{background:#f3f6f5;border-radius:8px;padding:12px;font-size:12px;color:#52666f}@media print{.no-print{display:none}}</style></head><body>
<button class="no-print" onclick="window.print()" style="float:right;padding:8px 14px">Print or save as PDF</button>
<h1>Policy schedule</h1><p>${esc(COMPANY.tradingName)} · ${esc(COMPANY.fspNumber)}</p>
<table>${rows.map(([name, value]) => `<tr><td>${esc(name)}</td><td><strong>${esc(value)}</strong></td></tr>`).join('')}</table>
<h2>Exclusions</h2><ul>${exclusions}</ul>
<h2>Claims on this policy</h2><ul>${history}</ul>
<h2>Your rights</h2><p class="note">${esc(COOLING_OFF)}</p>
<p class="note">Underwritten by ${esc(COMPANY.underwriter)}. Complaints: ${esc(COMPANY.complaintsEmail)}.</p>
</body></html>`;
}

export function openSchedule(policy: Policy, asset: Asset | undefined, holder: string, claims: Claim[]) {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  popup.document.write(scheduleHtml(policy, asset, holder, claims));
  popup.document.close();
  return true;
}
