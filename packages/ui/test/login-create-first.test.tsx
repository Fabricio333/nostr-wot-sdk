import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { LoginWidget } from '../src/login/LoginWidget';
import { NostrSessionProvider } from '../src/session-shell';
import { extractSecretKey, keyFileName, keyFileText } from '../src/login/key-file';

afterEach(() => { cleanup(); vi.restoreAllMocks(); delete (window as { nostr?: unknown }).nostr; });

const widget = (props: Parameters<typeof LoginWidget>[0] = {}) =>
  render(<NostrSessionProvider autoRestore={false}><LoginWidget layout="create-first" hideUnavailableNip07 requireKeyDownload {...props} /></NostrSessionProvider>);
const labels = () => [...document.querySelectorAll('.nui-method-label')].map((e) => e.textContent?.trim());

describe('create-first layout', () => {
  it('leads with Create a new account, then the existing-account ways in, without an extension when none is installed', () => {
    widget();
    expect(labels()).toEqual(['Create a new account', 'Private key or key file', 'Remote signer (bunker)']);
    expect(screen.getByText('I already have an account')).toBeTruthy();
    expect(document.querySelector('.nui-method-primary')?.textContent).toContain('Create a new account');
  });

  it('shows the browser extension once one is there', async () => {
    widget();
    (window as { nostr?: unknown }).nostr = { getPublicKey: async () => '' };
    await waitFor(() => expect(labels()).toEqual(['Create a new account', 'Browser extension', 'Private key or key file', 'Remote signer (bunker)']));
  });

  it('keeps Continue off until the new key file is downloaded', () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    widget();
    fireEvent.click(screen.getByText('Create a new account'));
    const cont = screen.getByText('Continue') as HTMLButtonElement;
    fireEvent.click(screen.getByRole('checkbox', { name: /I have backed up/ }));
    expect(cont.disabled).toBe(true);
    fireEvent.click(screen.getByText('⬇ Download your key file'));
    expect(cont.disabled).toBe(false);
  });

  it('logs in from an uploaded key file', async () => {
    const sk = generateSecretKey();
    const nsec = nip19.nsecEncode(sk);
    const onLogin = vi.fn();
    widget({ onLogin });
    fireEvent.click(screen.getByText('Private key or key file'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([keyFileText(nsec, nip19.npubEncode(getPublicKey(sk)))], 'key.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onLogin).toHaveBeenCalled());
    expect(onLogin.mock.calls[0][0]).toMatchObject({ method: 'import', nsec, pubkey: getPublicKey(sk) });
  });
});

describe('keyFileName', () => {
  it('carries the app name and the whole npub when given a prefix', () => {
    const npub = nip19.npubEncode(getPublicKey(generateSecretKey()));
    expect(keyFileName(npub, 'obelisk-sky')).toBe(`obelisk-sky-${npub}.txt`);
    expect(keyFileName(npub)).toBe(`nostr-key-${npub.slice(0, 12)}.txt`);
  });
});

describe('extractSecretKey', () => {
  it('finds the nsec in a key file, takes hex on its own line, and refuses an npub', () => {
    const sk = generateSecretKey();
    const nsec = nip19.nsecEncode(sk);
    const npub = nip19.npubEncode(getPublicKey(sk));
    expect(extractSecretKey(keyFileText(nsec, npub))?.nsec).toBe(nsec);
    expect(extractSecretKey(`  ${nsec}  `)?.nsec).toBe(nsec);
    const hex = Buffer.from(sk).toString('hex');
    expect(extractSecretKey(hex)?.nsec).toBe(nsec);
    expect(extractSecretKey(npub)).toBeNull();
    expect(extractSecretKey('hello')).toBeNull();
  });
});
