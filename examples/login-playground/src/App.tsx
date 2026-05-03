import { useState } from "react";
import { NostrDataProvider } from "@nostr-wot/data/react";
import {
  LoginButton,
  LoginWidget,
  NostrSessionProvider,
  useSession,
  type LoginMethodId,
} from "@nostr-wot/ui";

const ALL_METHODS: LoginMethodId[] = ["nip07", "nip46", "generate", "import"];

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
];

const NIP46_RELAYS = ["wss://relay.nsec.app", "wss://relay.damus.io"];

const APP_METADATA = {
  name: "@nostr-wot/ui — playground",
  url: typeof window !== "undefined" ? window.location.origin : "",
  description: "Local sandbox for editing the login modal",
};

export function App() {
  return (
    <NostrDataProvider relays={DEFAULT_RELAYS}>
      <NostrSessionProvider theme="dark" autoRestore>
        <Playground />
      </NostrSessionProvider>
    </NostrDataProvider>
  );
}

function Playground() {
  const [methods, setMethods] = useState<LoginMethodId[]>(ALL_METHODS);
  const [hideAdvanced, setHideAdvanced] = useState(false);
  const [profileSetup, setProfileSetup] = useState(false);
  const [nip46Mode, setNip46Mode] = useState<"qr" | "paste">("qr");
  const [showInline, setShowInline] = useState(true);
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  const toggleMethod = (m: LoginMethodId) => {
    setMethods((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  };

  return (
    <div className="pg-shell">
      <header className="pg-header">
        <h1>@nostr-wot/ui — login playground</h1>
        <span className="pg-tag">Vite · src-aliased · HMR</span>
      </header>

      <aside className="pg-card pg-controls">
        <h2>Widget controls</h2>

        <div className="pg-row">
          <label>Methods (order = render order)</label>
          <div className="pg-method-grid">
            {ALL_METHODS.map((m) => {
              const on = methods.includes(m);
              return (
                <label key={m} className={on ? "is-on" : ""}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleMethod(m)}
                  />
                  {m}
                </label>
              );
            })}
          </div>
        </div>

        <div className="pg-row">
          <label htmlFor="nip46Mode">NIP-46 default mode</label>
          <select
            id="nip46Mode"
            value={nip46Mode}
            onChange={(e) => setNip46Mode(e.target.value as "qr" | "paste")}
          >
            <option value="qr">qr (nostrconnect QR)</option>
            <option value="paste">paste (bunker:// URI)</option>
          </select>
        </div>

        <div className="pg-toggles">
          <label>
            <input
              type="checkbox"
              checked={hideAdvanced}
              onChange={(e) => setHideAdvanced(e.target.checked)}
            />
            hideAdvanced (no expander for generate/import)
          </label>
          <label>
            <input
              type="checkbox"
              checked={profileSetup}
              onChange={(e) => setProfileSetup(e.target.checked)}
            />
            profileSetup (publish kind-0 after generate)
          </label>
          <label>
            <input
              type="checkbox"
              checked={showInline}
              onChange={(e) => setShowInline(e.target.checked)}
            />
            Render inline {`<LoginWidget>`} below modal
          </label>
        </div>

        <h2 style={{ marginTop: 8 }}>Relays</h2>
        <div className="pg-row">
          <label>data provider</label>
          <code style={{ fontSize: 12, color: "#a3a3a3" }}>
            {DEFAULT_RELAYS.join(", ")}
          </code>
        </div>
        <div className="pg-row">
          <label>nip46 advertise</label>
          <code style={{ fontSize: 12, color: "#a3a3a3" }}>
            {NIP46_RELAYS.join(", ")}
          </code>
        </div>
      </aside>

      <section className="pg-stage">
        <div className="pg-card">
          <h2>Session</h2>
          <SessionPanel />
        </div>

        <div className="pg-card">
          <h2>{`<LoginButton />`} (modal)</h2>
          <div className="pg-stage-row">
            <LoginButton
              signInLabel="Open login modal"
              renderLoggedIn={({ pubkey, logout }) => (
                <button className="pg-logout" onClick={() => void logout()}>
                  Logout {pubkey.slice(0, 12)}…
                </button>
              )}
              modalProps={{
                title: "Sign in to playground",
                subtitle: "Pick any of the four flows. State below updates live.",
                methods,
                hideAdvanced,
                profileSetup,
                profileRelays: DEFAULT_RELAYS,
                nip46Mode,
                nip46Relays: NIP46_RELAYS,
                nip46Metadata: APP_METADATA,
                onLogin: ({ pubkey, method }) => {
                  setLastEvent(`onLogin · method=${method} · pubkey=${pubkey}`);
                },
                onError: (msg) => setLastEvent(`onError · ${msg}`),
              }}
            />
            {lastEvent && <span className="pg-pill">{lastEvent}</span>}
          </div>
        </div>

        {showInline && (
          <div className="pg-card">
            <h2>{`<LoginWidget />`} (inline, same props)</h2>
            <div className="pg-inline-widget">
              <LoginWidget
                title="Inline widget"
                subtitle="Same component the modal wraps. Useful for full-page sign-in screens."
                methods={methods}
                hideAdvanced={hideAdvanced}
                profileSetup={profileSetup}
                profileRelays={DEFAULT_RELAYS}
                nip46Mode={nip46Mode}
                nip46Relays={NIP46_RELAYS}
                nip46Metadata={APP_METADATA}
                onLogin={({ pubkey, method }) => {
                  setLastEvent(`inline.onLogin · method=${method} · pubkey=${pubkey}`);
                }}
                onError={(msg) => setLastEvent(`inline.onError · ${msg}`)}
              />
            </div>
          </div>
        )}

        <footer className="pg-foot">
          <span>
            Edit <code>packages/ui/src/login/**</code> or{" "}
            <code>packages/signers/src/**</code> — Vite HMR refreshes this view.
          </span>
          <span>localStorage: nui:nip46, nui:nsec</span>
        </footer>
      </section>
    </div>
  );
}

function SessionPanel() {
  const { pubkey, signer, isLoading, error, logout } = useSession();

  if (isLoading) {
    return <p style={{ color: "#a3a3a3", margin: 0 }}>Resolving signer…</p>;
  }
  if (!pubkey) {
    return (
      <p style={{ color: "#a3a3a3", margin: 0 }}>
        Not signed in. Use the modal or inline widget on the right.
      </p>
    );
  }

  const signerKind = describeSigner(signer);
  return (
    <>
      <dl className="pg-session">
        <dt>pubkey</dt>
        <dd>{pubkey}</dd>
        <dt>signer</dt>
        <dd>{signerKind}</dd>
        <dt>nip04</dt>
        <dd>{capability(signer, "nip04Encrypt")}</dd>
        <dt>nip44</dt>
        <dd>{capability(signer, "nip44Encrypt")}</dd>
      </dl>
      {error && (
        <p style={{ color: "#f87171", marginTop: 12 }}>error: {error.message}</p>
      )}
      <div style={{ marginTop: 16 }}>
        <button className="pg-logout" onClick={() => void logout()}>
          Logout
        </button>
      </div>
    </>
  );
}

function describeSigner(signer: unknown): string {
  if (!signer || typeof signer !== "object") return "—";
  const ctor = (signer as { constructor?: { name?: string } }).constructor?.name;
  return ctor ?? "Unknown";
}

function capability(signer: unknown, fn: string): string {
  if (!signer || typeof signer !== "object") return "—";
  return typeof (signer as Record<string, unknown>)[fn] === "function"
    ? "yes"
    : "no";
}
