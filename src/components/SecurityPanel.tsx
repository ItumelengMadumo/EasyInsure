import { FormEvent, useEffect, useState } from 'react';
import { fetchMFAPreference, setUpTOTP, signOut, updateMFAPreference, updatePassword, verifyTOTPSetup } from 'aws-amplify/auth';
import { isDemo } from '../lib/demo/mode';
import { titleCase } from '../lib/format';
import { Field, Status } from './ui';

type Setup = { secret: string; uri: string };
const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** Real account controls: change password, authenticator-app MFA, and sign out everywhere. */
export function SecurityPanel({ role, notify }: { role: string; notify: (message: string) => void }) {
  const demo = isDemo();
  const [mfa, setMfa] = useState<'loading' | 'on' | 'off'>(demo ? 'off' : 'loading');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo) return;
    fetchMFAPreference().then((preference) => setMfa(preference.enabled?.includes('TOTP') ? 'on' : 'off')).catch(() => setMfa('off'));
  }, [demo]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget; const form = new FormData(formElement);
    if (form.get('next') !== form.get('confirm')) return notify('The new passwords do not match.');
    setBusy(true);
    try { await updatePassword({ oldPassword: String(form.get('current')), newPassword: String(form.get('next')) }); formElement.reset(); notify('Password changed.'); }
    catch (error) { notify(message(error, 'Your password could not be changed.')); }
    finally { setBusy(false); }
  }
  async function startMfa() {
    setBusy(true);
    try {
      const details = await setUpTOTP();
      setSetup({ secret: details.sharedSecret, uri: details.getSetupUri('EasyInsure').toString() });
    } catch (error) { notify(message(error, 'Authenticator setup could not be started.')); }
    finally { setBusy(false); }
  }
  async function confirmMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code') ?? '').trim();
    setBusy(true);
    try { await verifyTOTPSetup({ code }); await updateMFAPreference({ totp: 'PREFERRED' }); setMfa('on'); setSetup(null); notify('Authenticator app switched on. You will be asked for a code when you sign in.'); }
    catch (error) { notify(message(error, 'That code was not accepted. Check your authenticator app and try again.')); }
    finally { setBusy(false); }
  }
  async function stopMfa() {
    setBusy(true);
    try { await updateMFAPreference({ totp: 'DISABLED' }); setMfa('off'); notify('Authenticator app switched off.'); }
    catch (error) { notify(message(error, 'Could not switch the authenticator app off.')); }
    finally { setBusy(false); }
  }
  async function signOutEverywhere() {
    if (!window.confirm('Sign out of EasyInsure on every device, including this one?')) return;
    await signOut({ global: true });
    window.location.assign('/');
  }

  return <section className="panel security-list">
    <span className="eyebrow">Security</span><h2>Account protection</h2>
    {demo && <p className="muted">These controls are switched off in the demo. In the live product you can change your password and turn on an authenticator app.</p>}
    <div><span><strong>Role-based access</strong><small>{titleCase(role)} permission set</small></span><Status value="enforced" /></div>
    <div><span><strong>Audit history</strong><small>Financial actions retained and traceable</small></span><Status value="active" /></div>

    <form className="security-form" onSubmit={changePassword}>
      <h3>Change password</h3>
      <Field label="Current password"><input name="current" type="password" autoComplete="current-password" required disabled={demo} /></Field>
      <Field label="New password" hint="At least 8 characters with a capital letter, a lowercase letter, a number and a symbol."><input name="next" type="password" autoComplete="new-password" minLength={8} required disabled={demo} /></Field>
      <Field label="Confirm new password"><input name="confirm" type="password" autoComplete="new-password" minLength={8} required disabled={demo} /></Field>
      <button className="secondary" disabled={busy || demo}>Change password</button>
    </form>

    <div className="mfa-block">
      <h3>Authenticator app (two-step sign-in)</h3>
      <p className="muted">Adds a six-digit code from an app such as Google Authenticator or Microsoft Authenticator to your sign-in.</p>
      {mfa === 'loading' && <p className="muted">Checking…</p>}
      {mfa === 'on' && <div className="mfa-row"><Status value="active" /><button className="secondary" onClick={stopMfa} disabled={busy || demo}>Switch off</button></div>}
      {mfa === 'off' && !setup && <button className="secondary" onClick={startMfa} disabled={busy || demo}>Set up an authenticator app</button>}
      {setup && <form onSubmit={confirmMfa} className="mfa-setup">
        <p>1. Open your authenticator app and add an account using this key (or <a href={setup.uri}>open it directly on your phone</a>).</p>
        <code>{setup.secret}</code>
        <Field label="2. Enter the six-digit code the app shows"><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></Field>
        <div className="form-actions"><button type="button" className="secondary" onClick={() => setSetup(null)}>Cancel</button><button className="primary" disabled={busy}>Confirm and switch on</button></div>
      </form>}
    </div>

    <div className="mfa-block">
      <h3>Devices</h3>
      <p className="muted">EasyInsure cannot list your individual sessions, but you can sign out everywhere if you think someone else has access.</p>
      <button className="secondary" onClick={signOutEverywhere} disabled={demo}>Sign out of all devices</button>
    </div>
  </section>;
}
