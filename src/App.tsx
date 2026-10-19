import { useEffect, useState } from 'react';
import { Authenticator, CheckboxField, useAuthenticator } from '@aws-amplify/ui-react';
import { getCurrentUser } from 'aws-amplify/auth';
import { AuthHeader } from './components/AuthHeader';
import { Workspace } from './components/Workspace';
import { DemoPicker } from './components/DemoPicker';
import { exitDemo } from './lib/demo/exit';
import { isDemo, isDemoEnabled } from './lib/demo/mode';
import { LandingPage } from './pages/LandingPage';
import { LEGAL_TOPICS, type LegalTopic } from './lib/legal';
import { LegalPage } from './pages/LegalPage';

type Entry = 'checking' | 'landing' | 'signIn' | 'signUp' | 'authenticated';

const legalFromUrl = (): LegalTopic | null => {
  const topic = new URLSearchParams(window.location.search).get('legal');
  return LEGAL_TOPICS.some((item) => item.id === topic) ? (topic as LegalTopic) : null;
};
/** Where a signed-out visitor should land: /login, /signup or ?auth=login|signup go straight to the form. */
const entryFromUrl = (): Entry => {
  const hint = new URLSearchParams(window.location.search).get('auth') ?? window.location.pathname.replace(/^\//, '');
  return hint === 'login' ? 'signIn' : hint === 'signup' ? 'signUp' : 'landing';
};

const formFields = {
  signIn: { username: { label: 'Email address', placeholder: 'you@example.com' } },
  signUp: {
    email: { label: 'Email address', placeholder: 'you@example.com', order: 1 },
    name: { label: 'Full name', placeholder: 'e.g. Thandi Mokoena', order: 2, isRequired: false },
    password: { label: 'Password', placeholder: 'At least 8 characters', order: 3 },
    confirm_password: { label: 'Confirm password', placeholder: 'Type it again', order: 4 },
  },
};

/** POPIA: sign-up needs an explicit, recorded agreement to the terms and privacy notice. */
function ConsentField({ onLegal }: { onLegal: (topic: LegalTopic) => void }) {
  const { validationErrors } = useAuthenticator();
  const link = (topic: LegalTopic, text: string) => <a href={`/?legal=${topic}`} onClick={(event) => { event.preventDefault(); onLegal(topic); }}>{text}</a>;
  return <CheckboxField name="acknowledgement" value="yes" errorMessage={String(validationErrors.acknowledgement ?? '')} hasError={Boolean(validationErrors.acknowledgement)}
    label={<span>I agree to the {link('terms', 'Terms of use')} and have read the {link('privacy', 'Privacy notice')}.</span>} />;
}

export default function App() {
  const [entry, setEntry] = useState<Entry>('checking');
  const [picker, setPicker] = useState(false);
  const [legal, setLegal] = useState<LegalTopic | null>(legalFromUrl);
  const openLegal = (topic: LegalTopic | null) => {
    setLegal(topic);
    window.history.pushState(null, '', topic ? `/?legal=${topic}` : '/');
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    const onPop = () => setLegal(legalFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const demo = isDemo();
  useEffect(() => {
    if (demo) return;
    getCurrentUser().then(() => setEntry('authenticated')).catch(() => setEntry(entryFromUrl()));
  }, [demo]);
  if (demo) return <Workspace signOut={exitDemo} />;
  if (legal && entry !== 'authenticated') return <LegalPage topic={legal} onTopic={openLegal} onBack={() => openLegal(null)} />;
  if (entry === 'checking') return <div className="app-boot"><span>EI</span><p>Opening your secure workspace…</p></div>;
  if (entry === 'landing') return <>
    <LandingPage onLogin={() => setEntry('signIn')} onRegister={() => setEntry('signUp')} onDemo={isDemoEnabled() ? () => setPicker(true) : undefined} onLegal={openLegal} />
    {picker && <DemoPicker onClose={() => setPicker(false)} />}
  </>;
  return <div className="auth-experience">
    <section className="auth-story">
      <button className="back-home" onClick={() => setEntry('landing')}>← Back to EasyInsure</button>
      <div className="auth-story-content">
        <span className="eyebrow">Insurance, clearly handled</span><h1>Protection you can understand.</h1>
        <p>Manage assets, policies and claims in one secure workspace, with human control over every financial decision.</p>
        <div className="auth-proof"><span>✓</span><div><strong>Human-approved outcomes</strong><small>AI assists with evidence and summaries. It never approves payouts.</small></div></div>
        <div className="auth-proof"><span>✓</span><div><strong>Auditable calculations</strong><small>Risk, premium and depreciation factors remain explainable.</small></div></div>
      </div>
    </section>
    <section className="auth-form-shell"><Authenticator initialState={entry === 'signUp' ? 'signUp' : 'signIn'} loginMechanisms={['email']} signUpAttributes={['name']} formFields={formFields}
      services={{ async validateCustomSignUp(values) { if (!values.acknowledgement) return { acknowledgement: 'You must agree to the terms and privacy notice to create an account.' }; } }}
      components={{ Header: AuthHeader, SignUp: { FormFields() { return <><Authenticator.SignUp.FormFields /><ConsentField onLegal={openLegal} /></>; } } }}>
      {({ signOut }) => <Workspace signOut={() => { signOut?.(); setEntry('landing'); }} />}
    </Authenticator>
    {isDemoEnabled() && <p className="auth-demo">Just exploring? <button onClick={() => { setEntry('landing'); setPicker(true); }}>Try the demo without an account</button></p>}</section>
    {picker && <DemoPicker onClose={() => setPicker(false)} />}
  </div>;
}
