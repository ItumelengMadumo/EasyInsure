// Spreadsheet-safe CSV export. Cells beginning with = + - @ are prefixed so a spreadsheet never
// evaluates client-supplied text as a formula.
const cell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

export const toCsv = (rows: unknown[][]) => rows.map((row) => row.map(cell).join(',')).join('\r\n');

export function downloadCsv(fileName: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
