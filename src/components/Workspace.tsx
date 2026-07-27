import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader } from '@aws-amplify/ui-react';
import { fetchAuthSession, fetchUserAttributes, getCurrentUser } from 'aws-amplify/auth';
import { client, loadPortfolio, setSimulationExecutor } from '../lib/data';
import { initials, titleCase } from '../lib/format';
import { capabilitiesFor, createScenarioPortfolio, personaByRole, personaLabEnabled, personas, resolveRole, scenarioCatalogue } from '../lib/personas';
import { simulateCommand } from '../lib/simulation';
import type { BusinessRole, Page, Portfolio, SimulationCommand, SimulationEvent, SimulationScenarioId, WorkspaceSession } from '../types';
import { OverviewPage } from '../pages/OverviewPage';
import { AssetsPage } from '../pages/AssetsPage';
import { PoliciesPage } from '../pages/PoliciesPage';
import { ClaimsPage } from '../pages/ClaimsPage';
import { DocumentsPage } from '../pages/DocumentsPage';
import { ReviewPage } from '../pages/ReviewPage';
import { ProfilePage } from '../pages/ProfilePage';
import { PersonaLabPage } from '../pages/PersonaLabPage';
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
  { page: 'personaLab', label: 'Persona Lab', icon: '◎', section: 'Development' },
  { page: 'profile', label: 'Profile & security', icon: '○', section: 'Account' },
];
const validRoles = new Set(personas.map((persona) => persona.role));
const validScenarios = new Set(scenarioCatalogue.map((scenario) => scenario.id));
const humanName = (value: string) => value.trim().replace(/\b\w/g, (letter) => letter.toUpperCase());

export function Workspace({ signOut }: { signOut?: () => void }) {
  const initialParams = new URLSearchParams(window.location.search);
  const initialPage = initialParams.get('page') as Page | null;
  const [page, setPage] = useState<Page>(nav.some((item) => item.page === initialPage) ? initialPage! : 'overview');
  const [portfolio, setPortfolio] = useState<Portfolio>(emptyPortfolio);
  const [owner, setOwner] = useState('');
  const [authenticatedName, setAuthenticatedName] = useState('');
  const [groups, setGroups] = useState<string[]>([]);
  const groupsRef = useRef<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [simulationRole, setSimulationRole] = useState<BusinessRole | null>(null);
  const [scenario, setScenario] = useState<SimulationScenarioId>('golden-journey');
  const [simulationPortfolio, setSimulationPortfolio] = useState<Portfolio | null>(null);
  const simulationPortfolioRef = useRef<Portfolio | null>(null);
  const [simulationEvents, setSimulationEvents] = useState<SimulationEvent[]>([]);
  const requestedSimulationRef = useRef({
    role: initialParams.get('viewAs') as BusinessRole | null,
    scenario: initialParams.get('scenario') as SimulationScenarioId | null,
  });
  const requestedSimulationAppliedRef = useRef(false);

  const refresh = useCallback(async () => {
    try { setPortfolio(await loadPortfolio(groupsRef.current)); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Portfolio data could not be loaded.'); }
    finally { setBusy(false); }
  }, [setBusy, setNotice, setPortfolio]);

  useEffect(() => {
    Promise.all([getCurrentUser(), fetchAuthSession(), fetchUserAttributes()]).then(([user, session, attributes]) => {
      setOwner(user.userId);
      const emailName = String(attributes.email ?? '').split('@')[0].replace(/[._-]+/g, ' ').trim();
      const candidate = String(attributes.name ?? attributes.preferred_username ?? emailName ?? '').trim();
      setAuthenticatedName(humanName(candidate && !/^easy\s*insure(?:\s+member)?$/i.test(candidate) ? candidate : emailName));
      const raw = session.tokens?.accessToken.payload['cognito:groups'];
      const resolvedGroups = Array.isArray(raw) ? raw.map(String) : [];
      groupsRef.current = resolvedGroups; setGroups(resolvedGroups);
      return client.mutations.ensureUserProfile({}).then(() => refresh());
    }).catch(() => { setNotice('Unable to resolve your secure workspace.'); setBusy(false); });
  }, [refresh]);

  const ownProfile = portfolio.profiles.find((profile) => profile.owner === owner) ?? portfolio.profile;
  const identity = resolveRole(groups, ownProfile?.businessRole);
  const liveRole = identity.role;
  const maySimulate = personaLabEnabled() && liveRole === 'developer';

  const beginSimulation = useCallback((role: BusinessRole, nextScenario: SimulationScenarioId = scenario, nextPage?: Page) => {
    if (!maySimulate) return;
    const next = createScenarioPortfolio(role, nextScenario);
    simulationPortfolioRef.current = next; setSimulationPortfolio(next); setSimulationEvents([]);
    setSimulationRole(role); setScenario(nextScenario);
    if (nextPage) setPage(nextPage);
  }, [maySimulate, scenario, setPage, setScenario, setSimulationEvents, setSimulationPortfolio, setSimulationRole]);

  useEffect(() => {
    if (!maySimulate || simulationRole || requestedSimulationAppliedRef.current) return;
    requestedSimulationAppliedRef.current = true;
    const { role: requestedRole, scenario: requestedScenario } = requestedSimulationRef.current;
    if (requestedRole && validRoles.has(requestedRole)) {
      queueMicrotask(() => beginSimulation(requestedRole, requestedScenario && validScenarios.has(requestedScenario) ? requestedScenario : 'golden-journey'));
    }
  }, [beginSimulation, maySimulate, simulationRole]);

  useEffect(() => {
    if (!simulationRole) { setSimulationExecutor(null); return; }
    setSimulationExecutor(async (command: SimulationCommand) => {
      const current = simulationPortfolioRef.current;
      if (!current) return { errors: [{ message: 'The simulation scenario is not initialized.' }] };
      const output = simulateCommand(current, command, simulationRole);
      simulationPortfolioRef.current = output.portfolio; setSimulationPortfolio(output.portfolio);
      setSimulationEvents((events) => [...events, output.event]);
      return output.result;
    });
    return () => setSimulationExecutor(null);
  }, [simulationRole]);

  useEffect(() => {
    if (simulationRole) return;
    const subscription = client.models.Claim.onUpdate({}).subscribe({ next: refresh, error: () => setNotice('Live updates paused. Refresh to reconnect.') });
    return () => subscription.unsubscribe();
  }, [simulationRole, refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (page === 'overview') params.delete('page'); else params.set('page', page);
    if (simulationRole) { params.set('viewAs', simulationRole); params.set('scenario', scenario); }
    else { params.delete('viewAs'); params.delete('scenario'); }
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
  }, [page, scenario, simulationRole]);

  const exitSimulation = () => {
    setSimulationExecutor(null); simulationPortfolioRef.current = null; setSimulationPortfolio(null);
    setSimulationRole(null); setSimulationEvents([]); setPage('personaLab'); setNotice('');
  };
  const resetSimulation = () => simulationRole && beginSimulation(simulationRole, scenario, page);
  const changeScenario = (next: SimulationScenarioId) => {
    const definition = scenarioCatalogue.find((item) => item.id === next)!;
    beginSimulation(simulationRole ?? 'client', next, definition.page);
  };

  const effectiveRole = simulationRole ?? liveRole ?? 'client';
  const capabilities = capabilitiesFor(effectiveRole);
  const effectivePortfolio = simulationPortfolio ?? portfolio;
  const effectiveOwner = simulationRole ? effectivePortfolio.profile?.owner ?? 'persona-client' : owner;
  const session: WorkspaceSession = { authenticatedRole: liveRole ?? 'client', effectiveRole, mode: simulationRole ? 'simulation' : 'live', scenario: simulationRole ? scenario : null, capabilities };
  const availableNav = nav.filter((item) => item.page === 'personaLab' ? maySimulate : capabilities.visiblePages.includes(item.page));
  const profileName = String(effectivePortfolio.profile?.displayName ?? '').trim();
  const displayName = profileName && !/^easy\s*insure(?:\s+member)?$/i.test(profileName)
    ? profileName : authenticatedName || humanName(String(effectivePortfolio.profile?.email ?? '').split('@')[0].replace(/[._-]+/g, ' ')) || 'Member';
  const simulationRefresh = async () => undefined;
  const props = { portfolio: effectivePortfolio, owner: effectiveOwner, refresh: simulationRole ? simulationRefresh : refresh, notify: setNotice };

  let content;
  if (busy) content = <div className="center"><Loader size="large" /></div>;
  else if (identity.conflict) content = <section className="panel page-error" role="alert"><span>Identity verification required</span><h1>Operational access is paused.</h1><p>{identity.conflict} A superuser must correct the Cognito group or profile before this account can read or change insurance records.</p></section>;
  else if (simulationRole && scenario === 'access-denied') content = <section className="panel page-error" role="alert"><span>Access denied scenario</span><h1>This user cannot open the requested workspace.</h1><p>The simulated authorization boundary has intentionally withheld operational records and actions.</p></section>;
  else if (simulationRole && scenario === 'role-conflict') content = <section className="panel page-error" role="alert"><span>Role conflict scenario</span><h1>Operational access is paused.</h1><p>The simulated profile role does not match the effective identity. A superuser must resolve the account before work continues.</p></section>;
  else if (page === 'assets') content = <AssetsPage {...props} mode={session.mode} capabilities={capabilities} />;
  else if (page === 'policies') content = <PoliciesPage {...props} capabilities={capabilities} />;
  else if (page === 'claims') content = <ClaimsPage {...props} capabilities={capabilities} />;
  else if (page === 'documents') content = <DocumentsPage {...props} />;
  else if (page === 'review') content = <ReviewPage {...props} capabilities={capabilities} />;
  else if (page === 'personaLab' && maySimulate) content = <PersonaLabPage groups={groups} profileRole={ownProfile?.businessRole} simulationRole={simulationRole} scenario={scenario} startSimulation={beginSimulation} />;
  else if (page === 'profile') content = <ProfilePage {...props} role={effectiveRole} mode={session.mode} capabilities={capabilities} />;
  else content = <OverviewPage portfolio={effectivePortfolio} go={setPage} displayName={displayName} capabilities={capabilities} />;

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
        <div className={`system-state ${liveRole === 'developer' ? 'developer' : ''}`}><span className="pulse" /> {simulationRole ? `${personaByRole(simulationRole).label} simulation` : liveRole === 'developer' ? 'Developer diagnostics enabled' : 'All systems operational'}</div>
        <div className="user-chip"><span className="avatar">{initials(displayName)}</span><div><strong>{displayName}</strong><small>{titleCase(effectiveRole)}</small></div></div>
      </header>
      {maySimulate && <section className={`view-as-toolbar ${simulationRole ? 'active' : ''}`}>
        <div className="view-as-identity"><small>Signed in as</small><strong>{authenticatedName || ownProfile?.displayName || 'Developer'} · Developer</strong></div>
        <label><span>View as</span><select value={simulationRole ?? ''} onChange={(event) => event.target.value ? beginSimulation(event.target.value as BusinessRole, scenario, page) : exitSimulation()}><option value="">Developer (live)</option>{personas.map((persona) => <option value={persona.role} key={persona.role}>{persona.label} · {persona.name}</option>)}</select></label>
        <label><span>Scenario</span><select value={scenario} disabled={!simulationRole} onChange={(event) => changeScenario(event.target.value as SimulationScenarioId)}>{scenarioCatalogue.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
        {simulationRole && <><div className="view-as-identity viewing"><small>Viewing as</small><strong>{personaByRole(simulationRole).name} · {personaByRole(simulationRole).label}</strong></div><button onClick={resetSimulation}>Reset</button><button onClick={() => setPage('personaLab')}>Persona Lab</button><button className="exit" onClick={exitSimulation}>Return to developer</button></>}
      </section>}
      {identity.conflict && <div className="notice identity-conflict" role="alert"><span>Access held: {identity.conflict} Contact a superuser before performing operational work.</span></div>}
      {simulationRole && <div className="preview-banner" role="status"><strong>SIMULATION — NO BACKEND CHANGES</strong><span>{scenarioCatalogue.find((item) => item.id === scenario)?.label} · {simulationEvents.length} local actions</span></div>}
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
      <div className="page"><PageErrorBoundary key={`${page}-${simulationRole ?? 'live'}-${scenario}`} page={page} onReset={() => setPage('overview')}>{content}</PageErrorBoundary></div>
    </main>
  </div>;
}
