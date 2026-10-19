// Sample file previews for demo mode, generated in the browser so no real documents are involved.

const escapeXml = (text: string) => text.replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[char] ?? char);

/** A small valid PDF with one line of text. */
function samplePdf(title: string) {
  const text = title.replace(/[()\\]/g, ' ');
  const stream = `BT /F1 22 Tf 60 760 Td (${text}) Tj 0 -34 Td /F1 12 Tf (Sample document for the EasyInsure demo.) Tj 0 -20 Td (No real evidence is stored in demo mode.) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF`;
  return URL.createObjectURL(new Blob([body], { type: 'application/pdf' }));
}

function sampleImage(title: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dbe7e4"/><stop offset="1" stop-color="#b9cfd0"/></linearGradient></defs><rect width="960" height="600" fill="url(#g)"/><rect x="160" y="250" width="640" height="190" rx="40" fill="#5d7c86"/><rect x="250" y="190" width="400" height="110" rx="30" fill="#7e9ba3"/><circle cx="290" cy="460" r="52" fill="#25363e"/><circle cx="670" cy="460" r="52" fill="#25363e"/><path d="M610 300 l70 60 -40 20z" fill="#b3402f" opacity=".85"/><text x="480" y="90" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#10283c">${escapeXml(title)}</text><text x="480" y="545" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#35505a">Sample image for the EasyInsure demo</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A preview URL for a demo document, or null when the type has no sample (for example video). */
export function sampleDocumentUrl(fileName: string, mediaType: string): string | null {
  if (mediaType === 'application/pdf') return samplePdf(fileName);
  if (mediaType.startsWith('image/')) return sampleImage(fileName);
  return null;
}
