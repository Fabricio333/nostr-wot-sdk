import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NostrDataProvider } from "@nostr-wot/data/react";
import {
  LoginWidget,
  NostrSessionProvider,
  clearPersistedNip46,
  clearPersistedNsec,
  useSession,
  type LoginMethodId,
} from "@nostr-wot/ui";
import {
  AlertIcon,
  CheckIcon,
  KeyIcon,
  LockIcon,
  MailIcon,
  PowerIcon,
  ShieldIcon,
  SparkleIcon,
  UserPlusIcon,
} from "./icons";

type ThemeId = "la-crypta" | "dark" | "light";
type StageId = "modal" | "inline" | "config";
type LastEvent =
  | { kind: "ok"; method: LoginMethodId; pubkey: string }
  | { kind: "err"; message: string }
  | null;

const ALL_METHODS: LoginMethodId[] = ["nip07", "nip46", "generate", "import"];

const METHOD_META: Record<
  LoginMethodId,
  { label: string; hint: string; icon: ReactNode }
> = {
  nip07: {
    label: "Browser extension",
    hint: "NIP-07 — Alby, nos2x, nostr-wot",
    icon: <LockIcon width={20} height={20} />,
  },
  nip46: {
    label: "Remote signer (bunker)",
    hint: "NIP-46 — Amber, Nsec.app, nostrconnect",
    icon: <ShieldIcon width={20} height={20} />,
  },
  generate: {
    label: "Create new account",
    hint: "Generate a fresh keypair on this device",
    icon: <SparkleIcon width={20} height={20} />,
  },
  import: {
    label: "Paste private key",
    hint: "nsec / hex — risky in browsers",
    icon: <KeyIcon width={20} height={20} />,
  },
};

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
  const [theme, setTheme] = useState<ThemeId>("la-crypta");
  return (
    <NostrDataProvider relays={DEFAULT_RELAYS}>
      <NostrSessionProvider theme={theme} autoRestore>
        <Playground theme={theme} setTheme={setTheme} />
      </NostrSessionProvider>
    </NostrDataProvider>
  );
}

function Playground({
  theme,
  setTheme,
}: {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}) {
  const [methods, setMethods] = useState<LoginMethodId[]>(ALL_METHODS);
  const [hideAdvanced, setHideAdvanced] = useState(false);
  const [profileSetup, setProfileSetup] = useState(true);
  const [showNoExtCta, setShowNoExtCta] = useState(true);
  const [rollbackOnAuthFailure, setRollbackOnAuthFailure] = useState(false);
  const [authBaseUrl, setAuthBaseUrl] = useState("");
  const [emailBackup, setEmailBackup] = useState(false);
  const [nip46Mode, setNip46Mode] = useState<"qr" | "paste">("qr");
  const [nip46Perms, setNip46Perms] = useState(
    "sign_event:1,nip04_encrypt,nip04_decrypt,nip44_encrypt,nip44_decrypt",
  );

  const [stage, setStage] = useState<StageId>("modal");
  const [modalOpen, setModalOpen] = useState(false);
  const [lastEvent, setLastEvent] = useState<LastEvent>(null);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);

  const toggleMethod = (m: LoginMethodId) =>
    setMethods((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );

  const methodIcons = useMemo(
    () => ({
      nip07: <LockIcon width={20} height={20} />,
      nip46: <ShieldIcon width={20} height={20} />,
      generate: <SparkleIcon width={20} height={20} />,
      import: <KeyIcon width={20} height={20} />,
    }),
    [],
  );

  const widgetProps = useMemo(() => {
    const base = {
      title: "Sign in",
      subtitle: "Pick any of the active flows.",
      methods,
      hideAdvanced,
      flatLayout: true,
      methodIcons,
      profileSetup,
      profileRelays: DEFAULT_RELAYS,
      nip46Mode,
      nip46Relays: NIP46_RELAYS,
      nip46Metadata: APP_METADATA,
      nip46Perms,
      noExtensionCta: showNoExtCta ? undefined : (false as const),
    };
    return authBaseUrl
      ? { ...base, authBaseUrl, rollbackOnAuthFailure }
      : base;
  }, [
    methods,
    hideAdvanced,
    methodIcons,
    profileSetup,
    nip46Mode,
    nip46Perms,
    showNoExtCta,
    authBaseUrl,
    rollbackOnAuthFailure,
  ]);

  const onLogin = ({ pubkey, method }: { pubkey: string; method: LoginMethodId }) => {
    setLastEvent({ kind: "ok", method, pubkey });
    if (method === "generate") setGeneratedAt(Date.now());
    setModalOpen(false);
  };
  const onError = (msg: string) => setLastEvent({ kind: "err", message: msg });

  const showBackupCard =
    emailBackup && lastEvent?.kind === "ok" && lastEvent.method === "generate";

  return (
    <div className="pg-shell">
      <header className="pg-header">
        <div className="pg-header-title">
          <span className="pg-logo">
            <PowerIcon width={20} height={20} />
          </span>
          <div>
            <h1>@nostr-wot/ui · login playground</h1>
            <div className="pg-header-meta">
              <span className="pg-pill">theme · {theme}</span>
              <span className="pg-pill">vite · src-aliased · HMR</span>
            </div>
          </div>
        </div>
        <div className="pg-stage-row">
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeId)}
            className="lc-pill lc-pill-ghost pg-select"
          >
            <option value="la-crypta">la-crypta</option>
            <option value="dark">dark</option>
            <option value="light">light</option>
          </select>
          <button
            type="button"
            className="lc-pill lc-pill-ghost"
            onClick={() => {
              clearPersistedNip46();
              clearPersistedNsec();
              setLastEvent(null);
              setGeneratedAt(null);
            }}
            title="Clear nui:nip46 + nui:nsec from localStorage"
          >
            Clear persisted signers
          </button>
        </div>
      </header>

      <aside className="pg-card pg-controls">
        <div className="pg-card-section">
          <h2>Login methods</h2>
          <div className="pg-method-list">
            {ALL_METHODS.map((m) => {
              const on = methods.includes(m);
              const meta = METHOD_META[m];
              return (
                <label
                  key={m}
                  className={`pg-method-toggle${on ? " is-on" : ""}`}
                >
                  <span className="pg-method-icon-wrap">{meta.icon}</span>
                  <span className="pg-method-meta">
                    <span className="pg-method-label">{meta.label}</span>
                    <span className="pg-method-hint">{meta.hint}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleMethod(m)}
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="pg-card-section">
          <h2>Flags</h2>
          <Flag
            label="hideAdvanced"
            hint="Collapse the “Advanced” disclosure (generate + import)."
            checked={hideAdvanced}
            onChange={setHideAdvanced}
          />
          <Flag
            label="profileSetup"
            hint="After Generate, show name / about / picture and publish kind-0."
            checked={profileSetup}
            onChange={setProfileSetup}
          />
          <Flag
            label="emailBackup"
            hint="Playground-only: render an email-encrypted nsec backup card after Generate (mappingbitcoin-style)."
            checked={emailBackup}
            onChange={setEmailBackup}
          />
          <Flag
            label="noExtensionCta"
            hint="Show the “Get the Nostr WoT extension” CTA when window.nostr is missing."
            checked={showNoExtCta}
            onChange={setShowNoExtCta}
          />
          <Flag
            label="rollbackOnAuthFailure"
            hint="If backend handshake fails, log the local signer out."
            checked={rollbackOnAuthFailure}
            onChange={setRollbackOnAuthFailure}
            disabled={!authBaseUrl}
          />
        </div>

        {methods.includes("nip46") && (
          <div className="pg-card-section">
            <h2>NIP-46 (remote signer)</h2>
            <div className="pg-row">
              <label className="pg-label" htmlFor="nip46Mode">
                default tab
              </label>
              <select
                id="nip46Mode"
                value={nip46Mode}
                onChange={(e) =>
                  setNip46Mode(e.target.value as "qr" | "paste")
                }
              >
                <option value="qr">qr — nostrconnect QR</option>
                <option value="paste">paste — bunker:// URI</option>
              </select>
            </div>
            <div className="pg-row" style={{ marginTop: 10 }}>
              <label className="pg-label" htmlFor="nip46Perms">
                perms
              </label>
              <input
                id="nip46Perms"
                type="text"
                value={nip46Perms}
                onChange={(e) => setNip46Perms(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="pg-card-section">
          <h2>Backend handshake</h2>
          <div className="pg-row">
            <label className="pg-label" htmlFor="authBaseUrl">
              authBaseUrl
            </label>
            <input
              id="authBaseUrl"
              type="text"
              value={authBaseUrl}
              onChange={(e) => setAuthBaseUrl(e.target.value)}
              placeholder="/api/auth"
            />
          </div>
        </div>
      </aside>

      <section className="pg-stage">
        <SessionStrip />

        <nav className="pg-tabs" role="tablist">
          {STAGES.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={stage === s.id}
              className={`pg-tab${stage === s.id ? " is-active" : ""}`}
              onClick={() => setStage(s.id)}
            >
              {s.icon}
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="pg-card pg-stage-card">
          {stage === "modal" && (
            <ModalStage onOpen={() => setModalOpen(true)} />
          )}
          {stage === "inline" && (
            <InlineStage
              widgetProps={widgetProps}
              onLogin={onLogin}
              onError={onError}
            />
          )}
          {stage === "config" && <ConfigStage props={widgetProps} />}
        </div>

        <PlaygroundModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          theme={theme}
          widgetProps={widgetProps}
          onLogin={onLogin}
          onError={onError}
        />

        <EventStrip event={lastEvent} onClear={() => setLastEvent(null)} />

        {showBackupCard && lastEvent?.kind === "ok" && (
          <div className="pg-card">
            <h2>Post-login follow-up · email-encrypted backup</h2>
            <EmailBackupCard
              key={generatedAt ?? 0}
              pubkey={lastEvent.pubkey}
            />
          </div>
        )}

        <footer className="pg-foot">
          <span>
            Edit <code>packages/ui/src/login/**</code> or{" "}
            <code>packages/signers/src/**</code> — Vite HMR refreshes this view.
          </span>
          <span>localStorage · nui:nip46 · nui:nsec</span>
        </footer>
      </section>
    </div>
  );
}

const STAGES: { id: StageId; label: string; icon: ReactNode }[] = [
  { id: "modal", label: "Modal trigger", icon: <LockIcon width={14} height={14} /> },
  { id: "inline", label: "Inline widget", icon: <SparkleIcon width={14} height={14} /> },
  { id: "config", label: "Resolved config", icon: <KeyIcon width={14} height={14} /> },
];

function Flag({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="pg-flag" style={disabled ? { opacity: 0.45 } : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="pg-flag-text">
        <span className="pg-flag-label">{label}</span>
        <span className="pg-flag-hint">{hint}</span>
      </span>
    </label>
  );
}

function SessionStrip() {
  const { pubkey, signer, isLoading, logout } = useSession();

  if (isLoading) {
    return (
      <div className="pg-session-strip">
        <span className="lc-spinner" />
        <span style={{ color: "var(--lc-muted)", fontSize: 13 }}>
          Resolving signer…
        </span>
      </div>
    );
  }

  if (!pubkey) {
    return (
      <div className="pg-session-strip pg-session-strip--off">
        <span className="pg-status-dot pg-status-dot--off" />
        <span>Not signed in</span>
        <span className="pg-session-spacer" />
        <span className="pg-pill">use a stage below</span>
      </div>
    );
  }

  return (
    <div className="pg-session-strip pg-session-strip--on">
      <span className="pg-status-dot pg-status-dot--on" />
      <span style={{ fontWeight: 600 }}>Signed in</span>
      <code className="pg-pubkey">{pubkey.slice(0, 12)}…{pubkey.slice(-6)}</code>
      <span className="pg-pill">{describeSigner(signer)}</span>
      <span className="pg-pill">
        nip04 · {capability(signer, "nip04Encrypt")}
      </span>
      <span className="pg-pill">
        nip44 · {capability(signer, "nip44Encrypt")}
      </span>
      <span className="pg-session-spacer" />
      <button className="lc-pill lc-pill-ghost" onClick={() => void logout()}>
        Logout
      </button>
    </div>
  );
}

function ModalStage({ onOpen }: { onOpen: () => void }) {
  const { pubkey, logout } = useSession();
  return (
    <div className="pg-stage-modal">
      <div className="pg-stage-modal-row">
        <div className="pg-stage-modal-icon-sm">
          <LockIcon width={18} height={18} />
        </div>
        <div className="pg-stage-modal-copy">
          <div className="pg-stage-modal-title">Modal trigger</div>
          <div className="pg-stage-modal-hint">
            Click to open the centered modal. Esc / X / overlay closes it.
          </div>
        </div>
        {pubkey ? (
          <button className="lc-pill lc-pill-ghost" onClick={() => void logout()}>
            Logout {pubkey.slice(0, 12)}…
          </button>
        ) : (
          <button className="lc-pill lc-pill-primary" onClick={onOpen}>
            <LockIcon width={14} height={14} /> Open modal
          </button>
        )}
      </div>
      <div className="pg-stage-modal-note">
        Modal is portaled into <code>document.body</code> with{" "}
        <code>position: fixed; z-index: 99999</code> — always covers the full
        viewport regardless of where the trigger sits.
      </div>
    </div>
  );
}

function PlaygroundModal({
  open,
  onClose,
  theme,
  widgetProps,
  onLogin,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  theme: ThemeId;
  widgetProps: any;
  onLogin: (a: { pubkey: string; method: LoginMethodId }) => void;
  onError: (msg: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    // Re-establish [data-nui-root] inside the portal so the SDK's CSS
    // variables (--nui-*) and theme-scoped overrides cascade into the modal.
    // Without this, portaled content escapes the provider's wrapper and
    // renders unstyled.
    <div data-nui-root="" data-nui-theme={theme}>
      <div
        className="pg-modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="pg-modal-card" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close"
            className="pg-modal-close"
            onClick={onClose}
          >
            ×
          </button>
          <LoginWidget
            {...widgetProps}
            title="Sign in to playground"
            subtitle="Pick any of the active flows. State below updates live."
            onLogin={(args) => {
              onLogin(args);
            }}
            onError={onError}
            onSuccess={onClose}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function InlineStage({
  widgetProps,
  onLogin,
  onError,
}: {
  widgetProps: any;
  onLogin: (a: { pubkey: string; method: LoginMethodId }) => void;
  onError: (msg: string) => void;
}) {
  return (
    <div className="pg-stage-inline">
      <div className="pg-stage-inline-frame">
        <LoginWidget
          {...widgetProps}
          title="Sign in"
          subtitle="Same component the modal wraps — drop directly into a sign-in screen."
          onLogin={onLogin}
          onError={onError}
        />
      </div>
    </div>
  );
}

function ConfigStage({ props }: { props: Record<string, unknown> }) {
  const json = useMemo(() => JSON.stringify(props, null, 2), [props]);
  const [copied, setCopied] = useState(false);
  return (
    <div className="pg-stage-config">
      <div className="pg-stage-config-head">
        <div>
          <h2 className="pg-stage-h" style={{ marginBottom: 4 }}>
            Resolved props
          </h2>
          <p className="pg-stage-sub" style={{ margin: 0 }}>
            Exact object passed to <code>&lt;LoginWidget /&gt;</code> and the
            modal. Toggle controls on the left to see it update.
          </p>
        </div>
        <button
          className="lc-pill lc-pill-ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(json);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked — ignore */
            }
          }}
        >
          {copied ? <CheckIcon width={14} height={14} /> : null}
          {copied ? "Copied" : "Copy JSON"}
        </button>
      </div>
      <pre className="pg-config-pre">{json}</pre>
    </div>
  );
}

function EventStrip({
  event,
  onClear,
}: {
  event: LastEvent;
  onClear: () => void;
}) {
  if (!event) {
    return (
      <div className="pg-event-strip pg-event-strip--idle">
        <span className="pg-status-dot pg-status-dot--idle" />
        <span style={{ color: "var(--lc-muted)" }}>
          Waiting for an event from the widget…
        </span>
      </div>
    );
  }
  if (event.kind === "ok") {
    return (
      <div className="pg-event-strip pg-event-strip--ok">
        <CheckIcon width={14} height={14} />
        <span style={{ fontWeight: 600 }}>onLogin</span>
        <span className="pg-pill">method · {event.method}</span>
        <code className="pg-pubkey">
          {event.pubkey.slice(0, 16)}…{event.pubkey.slice(-8)}
        </code>
        <span className="pg-session-spacer" />
        <button className="lc-pill lc-pill-ghost" onClick={onClear}>
          Clear
        </button>
      </div>
    );
  }
  return (
    <div className="pg-event-strip pg-event-strip--err">
      <AlertIcon width={14} height={14} />
      <span style={{ fontWeight: 600 }}>onError</span>
      <span style={{ flex: 1 }}>{event.message}</span>
      <button className="lc-pill lc-pill-ghost" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}

function EmailBackupCard({ pubkey }: { pubkey: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const valid = email.trim().includes("@") && password.length >= 12;

  const onSend = async () => {
    setSending(true);
    await new Promise((r) => setTimeout(r, 700));
    setSent(true);
    setSending(false);
  };

  return (
    <div className="pg-backup">
      <div className="pg-backup-header">
        <span className="pg-backup-icon">
          <MailIcon width={20} height={20} />
        </span>
        <div>
          <h3>Email-encrypted nsec backup</h3>
          <p>
            Encrypts the freshly generated nsec with your password (NIP-49) and
            mails the ncryptsec to your inbox.
          </p>
        </div>
      </div>

      <div className="pg-backup-warning">
        <AlertIcon width={14} height={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Demo only — playground does not send mail. Wire to{" "}
          <code>/api/auth/email-backup</code> in your app (mirrors mappingbitcoin).
        </span>
      </div>

      <div className="pg-row">
        <label className="pg-label" htmlFor="bk-email">
          email
        </label>
        <input
          id="bk-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={sending || sent}
        />
      </div>
      <div className="pg-row">
        <label className="pg-label" htmlFor="bk-pass">
          encryption password (≥ 12 chars)
        </label>
        <input
          id="bk-pass"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="strong passphrase"
          disabled={sending || sent}
        />
      </div>
      <div style={{ fontSize: 11, color: "var(--lc-muted)" }}>
        npub will be derived from {pubkey.slice(0, 16)}…
      </div>

      <button
        type="button"
        className="lc-pill lc-pill-primary"
        disabled={!valid || sending || sent}
        onClick={() => void onSend()}
      >
        {sending && <span className="lc-spinner" style={{ borderTopColor: "var(--lc-black)" }} />}
        {sent ? (
          <>
            <CheckIcon width={14} height={14} /> Sent
          </>
        ) : sending ? (
          "Encrypting & sending…"
        ) : (
          <>
            <UserPlusIcon width={14} height={14} /> Send encrypted backup
          </>
        )}
      </button>
    </div>
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
