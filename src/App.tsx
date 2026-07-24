import { useEffect, useState } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import { getCurrentUser } from 'aws-amplify/auth';
import { AuthHeader } from './components/AuthHeader';
import { Workspace } from './components/Workspace';
import { LandingPage } from './pages/LandingPage';

type Entry = 'checking' | 'landing' | 'signIn' | 'signUp' | 'authenticated';

export default function App() {
  const [entry, setEntry] = useState<Entry>('checking');
  useEffect(() => {
    getCurrentUser().then(() => setEntry('authenticated')).catch(() => setEntry('landing'));
  }, []);
  if (entry === 'checking') return <div className="app-boot"><span>EI</span><p>Opening your secure workspace…</p></div>;
  if (entry === 'landing') return <LandingPage onLogin={() => setEntry('signIn')} onRegister={() => setEntry('signUp')} />;
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
    <section className="auth-form-shell"><Authenticator initialState={entry === 'signUp' ? 'signUp' : 'signIn'} loginMechanisms={['email']} signUpAttributes={['preferred_username']} components={{ Header: AuthHeader }}>
      {({ signOut }) => <Workspace signOut={() => { signOut?.(); setEntry('landing'); }} />}
    </Authenticator></section>
  </div>;
}
