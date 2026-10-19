import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader } from '@aws-amplify/ui-react';
import { client, loadPortfolio } from '../lib/data';
import { isDemo } from '../lib/demo/mode';
import { getIdentity } from '../lib/identity';
import { roleFlags, type Access } from '../lib/roles';
import { initials, titleCase } from '../lib/format';
import type { Page, Portfolio } from '../types';
import { OverviewPage } from '../pages/OverviewPage';
import { AssetsPage } from '../pages/AssetsPage';
import { PoliciesPage } from '../pages/PoliciesPage';
import { ClaimsPage } from '../pages/ClaimsPage';
import { DocumentsPage } from '../pages/DocumentsPage';
import { ReviewPage } from '../pages/ReviewPage';
import { ProfilePage } from '../pages/ProfilePage';
import { AdminPage } from '../pages/AdminPage';
import { PageErrorBoundary } from './PageErrorBoundary';
import { DemoBanner } from './DemoBanner';

const emptyPortfolio: Portfolio = {
  assets: [], policies: [], applications: [], premiumAssessments: [], claims: [], documents: [], assignments: [],
  activities: [], communications: [], internalNotes: [], claimAssessments: [], analyses: [], jobs: [], profiles: [], profile: null,
};
type NavItem = { page: Page; label: string; icon: string; section?: string };
const ALL_PAGES: Page[] = ['overview', 'assets', 'policies', 'claims', 'documents', 'review', 'profile', 'admin', 'diagnostics'];

/** What each role can open. Staff do not apply for cover, so Assets is a client page; underwriting is a senior page. */
function navFor(access: Access): NavItem[] {
  const items: NavItem[] = [{ page: 'overview', label: access.isDeveloper ? 'Diagnostics' : access.isStaff ? 'Dashboard' : 'Overview', icon: '⌂', section: 'Workspace' }];
  if (access.isClient) items.push({ page: 'assets', label: 'Assets', icon: '◇' }, { page: 'policies', label: 'Policies', icon: '▤' });
  if (access.isSenior) items.push({ page: 'policies', label: 'Underwriting', icon: '▤' });
  items.push({ page: 'claims', label: access.isClient ? 'My claims' : 'Claims', icon: '◫' });
  if (!access.isDeveloper) items.push({ page: 'documents', label: access.isClient ? 'Document locker' : 'Evidence', icon: '□' });
  if (access.isStaff && !access.isDeveloper) items.push({ page: 'review', label: access.isSenior ? 'Review queue' : 'My submissions', icon: '✓', section: 'Operations' });
  if (access.isSuperuser) items.push({ page: 'admin', label: 'Admin console', icon: '⚙', ...(access.isSenior ? {} : { section: 'Operations' }) });
  items.push({ page: 'profile', label: 'Profile & security', icon: '○', section: 'Account' });
  return items;
}
const humanName = (value: string) => value.trim().replace(/\b\w/g, (letter) => letter.toUpperCase());

export function Workspace({ signOut }: { signOut?: () => void }) {
  const initialPage = new URLSearchParams(window.location.search).get('page') as Page | null;
  const [page, setPage] = useState<Page>(ALL_PAGES.includes(initialPage as Page) ? initialPage! : 'overview');
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
    getIdentity().then((identity) => {
      setOwner(identity.userId);
      const emailName = identity.email.split('@')[0].replace(/[._-]+/g, ' ').trim();
      const candidate = identity.name || emailName;
      setAuthenticatedName(humanName(candidate && !/^easy\s*insure(?:\s+member)?$/i.test(candidate) ? candidate : emailName));
      groupsRef.current = identity.groups;
      setGroups(identity.groups);
      // The AppSync access token carries no email/name claim, so the resolver
      // cannot see a human identity unless the authenticated client forwards it.
      return client.mutations.ensureUserProfile({
        ...(identity.email ? { email: identity.email } : {}),
        ...(identity.name ? { displayName: identity.name } : {}),
      }).then(() => refresh());
    }).catch(() => { setNotice('Unable to resolve your secure workspace.'); setBusy(false); });
    const sub = (window as any).__easyInsureClaimSubscription;
    return () => sub?.unsubscribe?.();
  }, [refresh]);

  // Messages confirm an action; they should not linger across pages or stay forever.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  const goTo = useCallback((next: Page) => { setNotice(''); setPage(next); }, []);

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
  const access = roleFlags(groups);
  const { isDeveloper } = access;
  const availableNav = navFor(access);
  // A role that cannot open the requested page (for example a link someone else sent) lands on its overview.
  const activePage: Page = availableNav.some((item) => item.page === page) ? page : 'overview';
  const profileName = String(portfolio.profile?.displayName ?? '').trim();
  const displayName = profileName && !/^easy\s*insure(?:\s+member)?$/i.test(profileName)
    ? profileName : authenticatedName || humanName(String(portfolio.profile?.email ?? '').split('@')[0].replace(/[._-]+/g, ' ')) || 'Member';
  const props = { portfolio, owner, refresh, notify: setNotice };
  let content;
  if (busy) content = <div className="center"><Loader size="large" /></div>;
  else if (activePage === 'assets') content = <AssetsPage {...props} />;
  else if (activePage === 'policies') content = <PoliciesPage {...props} groups={groups} />;
  else if (activePage === 'claims') content = <ClaimsPage {...props} groups={groups} />;
  else if (activePage === 'documents') content = <DocumentsPage {...props} groups={groups} />;
  else if (activePage === 'review') content = <ReviewPage {...props} groups={groups} />;
  else if (activePage === 'admin') content = <AdminPage {...props} groups={groups} />;
  else if (activePage === 'profile') content = <ProfilePage {...props} role={role} groups={groups} />;
  else content = <OverviewPage portfolio={portfolio} go={goTo} displayName={displayName} access={access} owner={owner} />;

  return <>
    {isDemo() && <DemoBanner />}
    <div className="app">
    <aside className={mobileNav ? 'nav-open' : ''}>
      <div className="brand"><span>EI</span><div><strong>EasyInsure</strong><small>Claims intelligence</small></div></div>
      <nav>{availableNav.map((item) => <div key={item.page}>{item.section && <span className="nav-section">{item.section}</span>}<button className={activePage === item.page ? 'active' : ''} aria-current={activePage === item.page ? 'page' : undefined} onClick={() => { goTo(item.page); setMobileNav(false); }}><i>{item.icon}</i>{item.label}</button></div>)}</nav>
      <div className="trust"><span className="pulse" /><div><strong>Human controlled</strong><p>AI assists. People decide.</p></div></div>
      <button className="signout" onClick={signOut}>↪ <span>Sign out</span></button>
    </aside>
    <main>
      <header className="topbar">
        <button className="menu-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Open navigation" aria-expanded={mobileNav}>☰</button>
        <div className={`system-state ${isDeveloper ? 'developer' : ''}`}><span className="pulse" /> {isDeveloper ? 'Developer diagnostics enabled' : 'All systems operational'}</div>
        <div className="user-chip"><span className="avatar">{initials(displayName)}</span><div><strong>{displayName}</strong><small>{titleCase(role)}</small></div></div>
      </header>
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
      <div className="page"><PageErrorBoundary page={activePage} onReset={() => goTo('overview')}>{content}</PageErrorBoundary></div>
    </main>
    </div>
  </>;
}
