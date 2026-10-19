import { useEffect, useState } from 'react';
import { getUrl } from 'aws-amplify/storage';
import { isDemo } from '../lib/demo/mode';
import { sampleDocumentUrl } from '../lib/demo/samples';
import { titleCase } from '../lib/format';
import { useModal } from '../lib/useModal';
import type { ClaimDocument } from '../types';
import { Status } from './ui';

/** Promoted evidence lives under evidence/; the registered key still names the quarantine path. */
const evidencePath = (objectKey: string) => objectKey.replace(/^quarantine\//, 'evidence/');

async function resolveUrl(document: ClaimDocument): Promise<string | null> {
  if (isDemo()) return sampleDocumentUrl(document.fileName, document.mediaType);
  if (!document.objectKey) return null;
  return (await getUrl({ path: evidencePath(document.objectKey), options: { expiresIn: 300 } })).url.toString();
}

type Loaded = { id: string; url: string | null; error: boolean };

export function DocumentPreview({ document, claimNumber, onClose }: { document: ClaimDocument; claimNumber?: string | null; onClose: () => void }) {
  const modal = useModal(onClose, `Preview of ${document.fileName}`);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [broken, setBroken] = useState(false);
  const clean = ['CLEAN', 'EXTRACTED'].includes(document.status);

  useEffect(() => {
    let cancelled = false;
    if (!clean) return;
    resolveUrl(document).then((url) => { if (!cancelled) setLoaded({ id: document.id, url, error: false }); })
      .catch(() => { if (!cancelled) setLoaded({ id: document.id, url: null, error: true }); });
    return () => { cancelled = true; };
  }, [document, clean]);

  const current = loaded?.id === document.id ? loaded : null;
  const url = current?.url ?? null;
  const type = document.mediaType;
  const canShow = Boolean(url) && !broken;
  return <div className="wizard-backdrop preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="preview-modal" {...modal}>
      <header>
        <div><span className="eyebrow">{claimNumber ?? 'Claim evidence'} · {titleCase(document.category ?? 'incident evidence')}</span><h2>{document.fileName}</h2>
          <p>{(document.byteSize / 1024 / 1024).toFixed(2)} MB · {type} <Status value={document.status} /></p></div>
        <button className="icon-button" onClick={onClose} aria-label="Close preview">×</button>
      </header>
      <div className="preview-stage">
        {!clean && <p className="preview-note">This file has not passed security scanning yet, so it cannot be opened. Its status will update when scanning finishes.</p>}
        {clean && !current && <p className="preview-note">Loading a secure preview…</p>}
        {clean && current?.error && <p className="preview-note">The secure preview could not be loaded. Try again in a moment.</p>}
        {clean && current && !current.error && !canShow && <p className="preview-note">{isDemo() && type.startsWith('video/') ? 'Video previews are not available in the demo.' : 'This browser cannot preview this file type. Use Download instead.'}</p>}
        {canShow && type === 'application/pdf' && <iframe title={document.fileName} src={url!} />}
        {canShow && type.startsWith('image/') && <img src={url!} alt={document.fileName} onError={() => setBroken(true)} />}
        {canShow && type.startsWith('video/') && <video src={url!} controls onError={() => setBroken(true)} />}
      </div>
      <footer>{url && <a className="secondary" href={url} download={document.fileName} target="_blank" rel="noreferrer">Download</a>}<button className="primary" onClick={onClose}>Close</button></footer>
    </section>
  </div>;
}
