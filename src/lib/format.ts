export const money = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
});

export const shortDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const titleCase = (value: string) =>
  value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export const initials = (value: string) =>
  value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'EI';

/** One date-and-time format for every table, timeline and drawer: "15 Oct 2026, 11:25". */
export const dateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

export const daysSince = (value?: string | null, now = Date.now()) =>
  value ? Math.max(0, Math.floor((now - new Date(value).getTime()) / 86_400_000)) : 0;
