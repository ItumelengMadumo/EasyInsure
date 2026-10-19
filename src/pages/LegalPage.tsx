import { COMPANY, COMPLAINT_BODIES, COOLING_OFF, hasPlaceholders } from '../lib/company';
import { LEGAL_TOPICS, type LegalTopic } from '../lib/legal';

/** Draft legal pages. The structure and product facts are accurate; every [PLACEHOLDER] needs compliance input. */
export function LegalPage({ topic, onTopic, onBack }: { topic: LegalTopic; onTopic: (topic: LegalTopic) => void; onBack: () => void }) {
  return <div className="legal-page">
    <header className="landing-nav"><a className="brand brand-dark" href="/"><span>EI</span><div><strong>EasyInsure</strong><small>Insurance, made clear</small></div></a><div className="landing-actions"><button className="secondary" onClick={onBack}>← Back to EasyInsure</button></div></header>
    <main className="legal-main">
      {hasPlaceholders() && <p className="legal-draft" role="note"><strong>Draft for compliance review.</strong> Items shown as [PLACEHOLDER] are awaiting the company's registered details and legal wording. This page is not yet the final notice.</p>}
      <nav className="legal-tabs" aria-label="Legal pages">{LEGAL_TOPICS.map((item) => <button key={item.id} className={item.id === topic ? 'active' : ''} aria-current={item.id === topic ? 'page' : undefined} onClick={() => onTopic(item.id)}>{item.label}</button>)}</nav>
      {topic === 'privacy' && <Privacy />}
      {topic === 'terms' && <Terms />}
      {topic === 'complaints' && <Complaints />}
      {topic === 'about' && <About />}
    </main>
  </div>;
}

function Privacy() {
  return <article>
    <h1>Privacy notice</h1>
    <p>This notice explains how {COMPANY.tradingName} collects and uses personal information under the Protection of Personal Information Act (POPIA).</p>
    <h2>Who is responsible</h2>
    <p>{COMPANY.legalName} is the responsible party. Our Information Officer is {COMPANY.informationOfficer}.</p>
    <h2>What we collect</h2>
    <ul><li>Your name and email address when you create an account.</li><li>Details about the assets you ask us to insure, including value, condition and where they are kept.</li><li>Your answers to underwriting questions, including claims history and relevant declarations.</li><li>Claim information: what happened, where and when, police case numbers, affidavits, photos, videos and other evidence.</li><li>Messages you send us, and notes about phone calls with the permission recorded for each call.</li></ul>
    <h2>Why we use it</h2>
    <ul><li>To assess applications, price and issue cover, and keep your policy up to date.</li><li>To assess, decide and pay claims, and to detect fraud using fixed rules.</li><li>To meet legal, audit and record-keeping duties.</li></ul>
    <h2>How AI is involved</h2>
    <p>AI is used to summarise claims for our staff. Identifying details such as names, emails, phone numbers and ID numbers are removed before anything is sent to an AI service. AI never approves a payout: a senior officer makes every financial decision.</p>
    <h2>How long we keep it</h2>
    <p>{'[PLACEHOLDER: retention periods to be confirmed by compliance]'}. When you close your account we remove your login and anonymise direct identifiers; claims, financial decisions and audit records are kept where the law requires.</p>
    <h2>Your rights</h2>
    <p>You may ask to see the information we hold about you, ask us to correct or delete it, and object to how we use it. Contact our Information Officer: {COMPANY.informationOfficer}. If you are unhappy with our response you may complain to the Information Regulator.</p>
    <h2>Security</h2>
    <p>Files you upload are isolated, scanned for malware and encrypted in storage. Access is limited to the people who need it for your case, and every financial action is recorded on an audit trail.</p>
  </article>;
}

function Terms() {
  return <article>
    <h1>Terms of use</h1>
    <h2>What this service does</h2>
    <p>{COMPANY.tradingName} lets you apply for insurance on your assets, accept a quote, and lodge and follow claims.</p>
    <h2>Estimates are not quotes</h2>
    <p>The ballpark premium on our website and the indicative range in your application are estimates from fixed formulas. They are not an offer of cover. Cover starts only after underwriting issues a formal quote and you accept it, and the quote shows your excess, cover limit and exclusions.</p>
    <h2>Telling us the truth</h2>
    <p>Your cover depends on the information you give us. Please answer every question honestly and completely. Incorrect or missing information can affect a claim.</p>
    <h2>Claims</h2>
    <p>To lodge a claim you provide a police case number and affidavit. Your claim is assessed from the evidence, the policy limit, depreciation and excess. A senior officer, who did not prepare the assessment, decides the claim. You will see the reason for a rejection on your case.</p>
    <h2>Your cooling-off rights</h2>
    <p>{COOLING_OFF}</p>
    <h2>General</h2>
    <p>{'[PLACEHOLDER: limitation of liability, changes to these terms and governing law, to be confirmed by legal counsel]'}</p>
  </article>;
}

function Complaints() {
  return <article>
    <h1>Complaints</h1>
    <p>If something has gone wrong, tell us first so we can put it right.</p>
    <h2>Contact us</h2>
    <p>Email {COMPANY.complaintsEmail} or phone {COMPANY.supportPhone}. Please include your policy or claim number.</p>
    <h2>If you are not satisfied</h2>
    <p>You may take your complaint to an independent body:</p>
    <ul>{COMPLAINT_BODIES.map((item) => <li key={item.name}><strong>{item.name}</strong><br />{item.note}</li>)}</ul>
  </article>;
}

function About() {
  return <article>
    <h1>About us and disclosures</h1>
    <dl className="legal-facts">
      <div><dt>Trading name</dt><dd>{COMPANY.tradingName}</dd></div>
      <div><dt>Registered company</dt><dd>{COMPANY.legalName}</dd></div>
      <div><dt>Authorised financial services provider</dt><dd>{COMPANY.fspNumber}</dd></div>
      <div><dt>Underwriter</dt><dd>{COMPANY.underwriter}</dd></div>
      <div><dt>Registered address</dt><dd>{COMPANY.registeredAddress}</dd></div>
      <div><dt>Support</dt><dd>{COMPANY.supportEmail} · {COMPANY.supportPhone}</dd></div>
    </dl>
  </article>;
}
