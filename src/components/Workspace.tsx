import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader } from '@aws-amplify/ui-react';
import { fetchAuthSession, fetchUserAttributes, getCurrentUser } from 'aws-amplify/auth';
import { client, loadPortfolio } from '../lib/data';
import { initials, titleCase } from '../lib/format';
import type { Page, Portfolio } from '../types';
import { OverviewPage } from '../pages/OverviewPage';
import { AssetsPage } from '../pages/AssetsPage';
import { PoliciesPage } from '../pages/PoliciesPage';
import { ClaimsPage } from '../pages/ClaimsPage';
import { DocumentsPage } from '../pages/DocumentsPage';
import { ReviewPage } from '../pages/ReviewPage';
import { ProfilePage } from '../pages/ProfilePage';
import { PageErrorBoundary } from './PageErrorBoundary';

const emptyPortfolio: Portfolio = {
  assets: [], policies: [], applications: [], premiumAssessments: [], claims: [], documents: [], assignments: [],
  activities: [], communications: [], internalNotes: [], claimAssessments: [], profiles: [], profile: null,
};
const nav: { page: Page; label: string; icon: string; section?: string }[] = [
  { page: 'overview', label: 'Overview', icon: '⌂', section: 'Workspace' },
  { page: 'assets', label: 'Assets', icon: '◇' },
  { page: 'policies', label: 'Policies', icon: '▤' },
  { page: 'claims', label: 'Claims', icon: '◫' },
  { page: 'documents', label: 'Document locker', icon: '□' },
  { page: 'review', label: 'Review queue', icon: '✓', section: 'Operations' },
  { page: 'profile', label: 'Profile & security', icon: '○', section: 'Account' },
];
const humanName = (value: string) => value.trim().replace(/\b\w/g, (letter) => letter.toUpperCase());

export function Workspace({ signOut }: { signOut?: () => void }) {
  const initialPage = new URLSearchParams(window.location.search).get('page') as Page | null;
  const [page, setPage] = useState<Page>(nav.some((item) => item.page === initialPage) ? initialPage! : 'overview');
  const [portfolio, setPortfolio] = useState<Portfolio>(emptyPortfolio);
  const [owner, setOwner] = useState('');
  const [authenticatedName, setAuthenticatedName] = useState('');
  const [groups, setGroups] = useState<string[]>([]);
  const groupsRef = useRef<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');
  const [mobileNav, setMobileNav] = useState(false);

  const refresh = useCallback(async () => {
    try { setPortfolio(await loadPortfolio(groupsRef.current)); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Portfolio data could not be loaded.'); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    Promise.all([getCurrentUser(), fetchAuthSession(), fetchUserAttributes()]).then(([user, session, attributes]) => {
      setOwner(user.userId);
      const emailName = String(attributes.email ?? '').split('@')[0].replace(/[._-]+/g, ' ').trim();
      const candidate = String(attributes.name ?? attributes.preferred_username ?? emailName ?? '').trim();
      setAuthenticatedName(humanName(candidate && !/^easy\s*insure(?:\s+member)?$/i.test(candidate) ? candidate : emailName));
      const raw = session.tokens?.accessToken.payload['cognito:groups'];
      const resolvedGroups = Array.isArray(raw) ? raw.map(String) : [];
      groupsRef.current = resolvedGroups;
      setGroups(resolvedGroups);
      return client.mutations.ensureUserProfile({}).then(() => refresh());
    }).catch(() => { setNotice('Unable to resolve your secure workspace.'); setBusy(false); });
    const sub = (window as any).__easyInsureClaimSubscription;
    return () => sub?.unsubscribe?.();
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (page === 'overview') params.delete('page'); else params.set('page', page);
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
  }, [page]);

  useEffect(() => {
    const subscription = client.models.Claim.onUpdate({}).subscribe({ next: refresh, error: () => setNotice('Live updates paused. Refresh to reconnect.') });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const role = portfolio.profile?.businessRole ?? (groups[0] || 'client');
  const isStaff = groups.some((group) => group.includes('officer') || ['developer', 'superuser'].includes(group));
  const isDeveloper = groups.includes('developer');
  const availableNav = nav.filter((item) => item.page !== 'review' || isStaff);
  const profileName = String(portfolio.profile?.displayName ?? '').trim();
  const displayName = profileName && !/^easy\s*insure(?:\s+member)?$/i.test(profileName)
    ? profileName : authenticatedName || humanName(String(portfolio.profile?.email ?? '').split('@')[0].replace(/[._-]+/g, ' ')) || 'Member';
  const props = { portfolio, owner, refresh, notify: setNotice };
  let content;
  if (busy) content = <div className="center"><Loader size="large" /></div>;
  else if (page === 'assets') content = <AssetsPage {...props} />;
  else if (page === 'policies') content = <PoliciesPage {...props} groups={groups} />;
  else if (page === 'claims') content = <ClaimsPage {...props} groups={groups} />;
  else if (page === 'documents') content = <DocumentsPage {...props} />;
  else if (page === 'review') content = <ReviewPage {...props} groups={groups} />;
  else if (page === 'profile') content = <ProfilePage {...props} role={role} />;
  else content = <OverviewPage portfolio={portfolio} go={setPage} displayName={displayName} />;

  return <div className="app">
    <aside className={mobileNav ? 'nav-open' : ''}>
      <div className="brand"><span>EI</span><div><strong>EasyInsure</strong><small>Claims intelligence</small></div></div>
      <nav>{availableNav.map((item) => <div key={item.page}>{item.section && <span className="nav-section">{item.section}</span>}<button className={page === item.page ? 'active' : ''} onClick={() => { setPage(item.page); setMobileNav(false); }}><i>{item.icon}</i>{item.label}</button></div>)}</nav>
      <div className="trust"><span className="pulse" /><div><strong>Human controlled</strong><p>AI assists. People decide.</p></div></div>
      <button className="signout" onClick={signOut}>↪ <span>Sign out</span></button>
    </aside>
    <main>
      <header className="topbar">
        <button className="menu-button" onClick={() => setMobileNav(!mobileNav)}>☰</button>
        <div className={`system-state ${isDeveloper ? 'developer' : ''}`}><span className="pulse" /> {isDeveloper ? 'Developer diagnostics enabled' : 'All systems operational'}</div>
        <div className="user-chip"><span className="avatar">{initials(displayName)}</span><div><strong>{displayName}</strong><small>{titleCase(role)}</small></div></div>
      </header>
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
      <div className="page"><PageErrorBoundary page={page} onReset={() => setPage('overview')}>{content}</PageErrorBoundary></div>
    </main>
  </div>;
}
