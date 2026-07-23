import { EmptyState, PageHeader, Status } from '../components/ui';
import { titleCase } from '../lib/format';
import type { Portfolio } from '../types';

export function DocumentsPage({ portfolio }: { portfolio: Portfolio }) {
  return <>
    <PageHeader eyebrow="Secure evidence" title="Document locker." description="Evidence is quarantined, scanned and tracked before it enters a claim decision." />
    <div className="security-banner"><span>✓</span><div><strong>Private by design</strong><p>Files are isolated on upload and only clean evidence is released to the processing workflow.</p></div><small>Encrypted storage</small></div>
    {portfolio.documents.length ? <div className="document-list">{portfolio.documents.map((document) => {
      const claim = portfolio.claims.find((item) => item.id === document.claimId);
      return <article key={document.id}><div className="file-icon">{document.mediaType.includes('pdf') ? 'PDF' : 'IMG'}</div><div><strong>{document.fileName}</strong><small>{claim?.claimNumber ?? 'Claim evidence'} · {(document.byteSize / 1024 / 1024).toFixed(2)} MB</small></div><span className="document-type">{titleCase(document.mediaType.split('/').pop() ?? '')}</span><Status value={document.status} /><button className="text-button">Details →</button></article>;
    })}</div> : <EmptyState title="Your locker is empty" copy="Evidence uploaded with a claim will be secured and shown here." />}
  </>;
}
