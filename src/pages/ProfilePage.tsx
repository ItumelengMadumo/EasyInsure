import { FormEvent } from 'react';
import { deleteUser } from 'aws-amplify/auth';
import { Field, PageHeader, Status } from '../components/ui';
import { client } from '../lib/data';
import { initials, titleCase } from '../lib/format';
import type { Portfolio } from '../types';

type Props = { portfolio: Portfolio; role: string; refresh: () => Promise<void>; notify: (message: string) => void };
export function ProfilePage({ portfolio, role, refresh, notify }: Props) {
  const profile = portfolio.profile;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!profile) return notify('Profile provisioning is still in progress.');
    const form = new FormData(event.currentTarget); const result = await client.models.UserProfile.update({ id: profile.id, displayName: String(form.get('displayName')) });
    if (result.errors?.length) notify(result.errors[0].message); else { notify('Profile updated.'); await refresh(); }
  }
  async function closeAccount() {
    if (!window.confirm('Close your EasyInsure account? Access will be removed and legally retained case records will be anonymised and archived.')) return;
    const result = await client.mutations.requestAccountClosure({
      idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(),
    });
    if (result.errors?.length) return notify(result.errors[0].message);
    await deleteUser();
    window.location.assign('/');
  }
  return <>
    <PageHeader eyebrow="Account controls" title="Profile & security." description="Manage your identity, preferences and secure access." />
    <div className="profile-layout"><section className="profile-card panel"><div className="profile-avatar">{initials(profile?.displayName || profile?.email || 'EI')}</div><h2>{profile?.displayName || 'EasyInsure member'}</h2><p>{profile?.email || 'Profile provisioning in progress'}</p><Status value={profile?.status || 'active'} /><div className="role-block"><small>Business role</small><strong>{titleCase(role)}</strong><p>Permissions are enforced by Cognito groups and backend authorization rules.</p></div></section><div className="profile-settings"><form className="panel form" onSubmit={save}><div><span className="eyebrow">Personal details</span><h2>How we identify you</h2></div><Field label="Display name"><input name="displayName" defaultValue={profile?.displayName ?? ''} /></Field><Field label="Email address" hint="Email changes require a new verification."><input value={profile?.email ?? ''} disabled /></Field><button className="primary">Save changes</button></form><section className="panel security-list"><span className="eyebrow">Security</span><h2>Account protection</h2><div><span><strong>Secure authentication</strong><small>Managed by Amazon Cognito</small></span><Status value="active" /></div><div><span><strong>Role-based access</strong><small>{titleCase(role)} permission set</small></span><Status value="enforced" /></div><div><span><strong>Audit history</strong><small>Financial actions retained and traceable</small></span><Status value="active" /></div></section><section className="panel danger-zone"><span className="eyebrow">Account closure</span><h2>End the client relationship</h2><p>This removes login access. Claims and communication required for compliance are anonymised and archived under the configured retention policy.</p><button className="reject-button" onClick={closeAccount}>Close and delete my account</button></section></div></div>
  </>;
}
