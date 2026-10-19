import { useState } from 'react';
import { DocumentPreview } from '../components/DocumentPreview';
import { EmptyState, Field, PageHeader, Status } from '../components/ui';
import { titleCase } from '../lib/format';
import { clientName } from '../lib/portfolio';
import { roleFlags } from '../lib/roles';
import type { ClaimDocument, Portfolio } from '../types';

const kind = (document: ClaimDocument) => (document.mediaType.includes('pdf') ? 'PDF' : document.mediaType.startsWith('video/') ? 'VID' : 'IMG');

export function DocumentsPage({ portfolio, groups }: { portfolio: Portfolio; groups: string[] }) {
  const { isStaff } = roleFlags(groups);
  const [open, setOpen] = useState<ClaimDocument | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const claimOf = (document: ClaimDocument) => portfolio.claims.find((item) => item.id === document.claimId);
  const documents = portfolio.documents.filter((document) => {
    const claim = claimOf(document);
    const text = `${document.fileName} ${claim?.claimNumber ?? ''} ${claim ? clientName(portfolio, claim.owner) : ''}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (!category || document.category === category);
  });
  const categories = [...new Set(portfolio.documents.map((item) => item.category).filter(Boolean))] as string[];
  return <>
    <PageHeader eyebrow="Secure evidence" title={isStaff ? 'Evidence for your cases.' : 'Document locker.'} description="Evidence is quarantined, scanned and tracked before it enters a claim decision. Open any file to see it securely." />
    <div className="security-banner"><span>✓</span><div><strong>Private by design</strong><p>Files are isolated on upload and only clean evidence is released to the processing workflow.</p></div><small>Encrypted storage</small></div>
    {portfolio.documents.length > 0 && <section className="panel claim-tools"><label className="search">⌕ <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by file name, claim number or client…" aria-label="Search documents" /></label>
      <div className="tool-row"><Field label="Type of document"><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All types</option>{categories.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></Field><div className="tool-actions"><strong>{documents.length} {documents.length === 1 ? 'file' : 'files'}</strong></div></div></section>}
    {documents.length ? <div className="document-list">{documents.map((document) => {
      const claim = claimOf(document);
      return <article key={document.id}><div className="file-icon">{kind(document)}</div><div><strong>{document.fileName}</strong><small>{claim?.claimNumber ?? 'Claim evidence'}{isStaff && claim ? ` · ${clientName(portfolio, claim.owner)}` : ''} · {titleCase(document.category ?? 'incident evidence')} · {(document.byteSize / 1024 / 1024).toFixed(2)} MB</small></div><span className="document-type">{titleCase(document.mediaType.split('/').pop() ?? '')}</span><Status value={document.status} /><button className="text-button" onClick={() => setOpen(document)} aria-label={`Open ${document.fileName}`}>Open →</button></article>;
    })}</div> : <EmptyState title={portfolio.documents.length ? 'No files match' : 'Your locker is empty'} copy={portfolio.documents.length ? 'Try a different search or type.' : 'Evidence uploaded with a claim will be secured and shown here.'} />}
    {open && <DocumentPreview key={open.id} document={open} claimNumber={claimOf(open)?.claimNumber} onClose={() => setOpen(null)} />}
  </>;
}
