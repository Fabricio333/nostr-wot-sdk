"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  isNip07Available,
  type NostrSigner,
} from "nostr-wot-sdk/signers";
import { useLogin, useLogout } from "nostr-wot-sdk/data/react";
import { cx } from "../utils";
import type { ClassSlots, LoginMethodId, LoginWidgetSlot, StyleSlots } from "../types";
import { performBackendAuth } from "../auth-handshake";
import { Nip07Method } from "./methods/Nip07Method";
import { Nip46Method } from "./methods/Nip46Method";
import type { Nip46ConnectionOptions } from "./methods/Nip46ConnectionActions";
import { GenerateMethod } from "./methods/GenerateMethod";
import { ImportMethod } from "./methods/ImportMethod";

export interface LoginWidgetSlotsProp {
  /** Above the title — usually a logo or app name. */
  header?: ReactNode;
  /** Below all methods — usually TOS / privacy links. */
  footer?: ReactNode;
  /** Between the title block and the method list. */
  beforeMethods?: ReactNode;
  /** Between the method list and the footer. */
  afterMethods?: ReactNode;
}

export interface LoginWidgetProps {
  /** Title shown at the top. Default "Sign in to Nostr". */
  title?: ReactNode;
  /** Subtitle / supporting copy under the title. */
  subtitle?: ReactNode;
  /** Branding slots — render arbitrary nodes around the methods. */
  slots?: LoginWidgetSlotsProp;
  /**
   * Methods to show, in order. Default is all four with `generate` +
   * `import` collapsed under an "Advanced" expand. Pass an explicit
   * subset to lock the choices.
   */
  methods?: LoginMethodId[];
  /**
   * Async login hook. Awaited after the signer attaches but BEFORE the
   * modal closes. Throw to keep the modal open + display the error in
   * the inline `nui-error` slot. Receives `{ signer, pubkey, method }`
   * — `method` discriminates which flow the user used so the consumer
   * can do method-specific work (e.g. show a "back up your nsec"
   * follow-up only for `generate`).
   *
   * If you also pass `authBaseUrl`, the backend handshake runs first;
   * `onLogin` runs only on success.
   */
  onLogin?: (args: {
    signer: NostrSigner;
    pubkey: string;
    method: LoginMethodId;
    /** Present when `method === 'generate'` or `'import'` — the user's nsec (bech32). */
    nsec?: string;
    /** Present when `method === 'nip46'` — the bunker:// URI used (real for paste mode,
     *  synthesized from the bunker pubkey + relays for QR mode). */
    bunkerUri?: string;
    /** Present when `method === 'nip46'` — the client-side nsec used to pair with the
     *  remote signer. Re-using this nsec is required to reconnect without re-authorizing. */
    clientNsec?: string;
  }) => Promise<void> | void;
  /** Fire-and-forget callback fired after `onLogin` resolves. */
  onSuccess?: () => void;
  /** Inline error display callback (besides the `nui-error` region). */
  onError?: (message: string) => void;
  /**
   * Mount point of `@nostr-wot/auth` server handlers (e.g. `/api/auth`).
   * When set, the widget runs the challenge → sign → verify flow and
   * persists the JWT cookie automatically. Errors here are surfaced in
   * the inline error region; the modal stays open.
   */
  authBaseUrl?: string;
  /** When `authBaseUrl` is set: roll back the local signer if the backend
   *  handshake fails. Default false (keep the local signer; user can retry). */
  rollbackOnAuthFailure?: boolean;
  /** Hide the "Advanced" disclosure for generate + import. Default false. */
  hideAdvanced?: boolean;
  /**
   * When true, render all methods in a single flat vertical list — no
   * "Advanced" disclosure, no divider. Generate / import sit alongside
   * nip07 / nip46. Default false.
   */
  flatLayout?: boolean;
  /**
   * `"create-first"`: "Create a new account" leads as the main button, then a
   * divider (`existingAccountLabel`) and the ways in for an existing account, in
   * `methods` order (nip07, import, nip46 by default). No "Advanced" disclosure.
   * Overrides `flatLayout`. Default `"default"`.
   */
  layout?: "default" | "create-first";
  /** The divider above the existing-account methods in the `"create-first"` layout.
   *  Default "I already have an account". */
  existingAccountLabel?: ReactNode;
  /**
   * Leave the browser-extension method out when no `window.nostr` is there (it is
   * checked again for a few seconds, since extensions inject late, and when the
   * window regains focus). The `noExtensionCta` still shows. Default false.
   */
  hideUnavailableNip07?: boolean;
  /** Forwarded to the generate flow: the key file must be downloaded before
   *  Continue. Default false. */
  requireKeyDownload?: boolean;
  /** Forwarded to the generate flow: the key file is named `<prefix>-<npub>.txt`. */
  keyFilePrefix?: string;
  /** Forwarded to the import flow: offer "Upload key file". Default true. */
  allowKeyFile?: boolean;
  /**
   * Reserved for future remember-me UI; currently no-op. Accepted so
   * consumers can pre-thread the prop. Default true.
   */
  showRememberToggle?: boolean;
  /**
   * Override the default emoji icons (`🔌`, `🔐`, `✨`, `🔑`) for each
   * method's primary button. Provided node renders inside the existing
   * `nui-method-icon` span so styling is preserved.
   */
  methodIcons?: {
    nip07?: ReactNode;
    nip46?: ReactNode;
    generate?: ReactNode;
    import?: ReactNode;
  };
  /**
   * Renderable shown below the methods when `nip07` is in the method list
   * but no `window.nostr` is detected. Default: a CTA pointing to
   * https://nostr-wot.com/download. Pass `false` to suppress entirely or
   * a `ReactNode` to fully customize.
   */
  noExtensionCta?: ReactNode | false;
  /** When true, the "Generate" flow shows a profile-setup step (name /
   *  about / picture) and publishes a kind-0 event. Default false. */
  profileSetup?: boolean;
  /** Relays to publish the kind-0 to when `profileSetup` is on. */
  profileRelays?: string[];
  /** Default tab on the NIP-46 form: QR or paste-bunker-URI. Default "qr". */
  nip46Mode?: "qr" | "paste";
  /** Relays to advertise on the nostrconnect QR. */
  nip46Relays?: string[];
  /** App metadata embedded in the nostrconnect QR. */
  nip46Metadata?: { name?: string; url?: string; description?: string; image?: string };
  /** NIP-46 perms string (`sign_event:1,nip44_encrypt,...`). */
  nip46Perms?: string;
  /** Native signer-link and clipboard labels, handoff URL, and host clipboard adapter. */
  nip46Connection?: Nip46ConnectionOptions;
  classes?: ClassSlots<LoginWidgetSlot>;
  styles?: StyleSlots<LoginWidgetSlot>;
}

const DEFAULT_METHODS: LoginMethodId[] = ["nip07", "nip46", "generate", "import"];
const CREATE_FIRST_METHODS: LoginMethodId[] = ["generate", "nip07", "import", "nip46"];

/** Whether a NIP-07 signer is on the page, watched for a few seconds after
 *  mount (extensions inject late) and again whenever the window regains focus. */
function useNip07Available(): boolean {
  const [available, setAvailable] = useState(() => isNip07Available());
  useEffect(() => {
    if (available || typeof window === "undefined") return;
    const check = () => { if (isNip07Available()) setAvailable(true); };
    const timer = window.setInterval(check, 250);
    const stop = window.setTimeout(() => window.clearInterval(timer), 4000);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
      window.removeEventListener("focus", check);
    };
  }, [available]);
  return available;
}

const DEFAULT_NO_EXTENSION_CTA: ReactNode = (
  <a
    href="https://nostr-wot.com/download"
    target="_blank"
    rel="noreferrer noopener"
    className="nui-no-extension-cta"
  >
    <span className="nui-no-extension-icon" aria-hidden>🛡️</span>
    <span>
      <span className="nui-no-extension-title">Get the Nostr WoT extension</span>
      <span className="nui-no-extension-hint">
        Browser extension with NIP-07 signer + Web of Trust spam filtering ↗
      </span>
    </span>
  </a>
);

/**
 * Inline login widget. Renders the chosen login methods + handles state
 * transitions between picker / form / generated-key views. Backend
 * handshake (when `authBaseUrl` is set) and `onLogin` run after the
 * signer is attached and before the widget signals success.
 */
export function LoginWidget({
  title = "Sign in to Nostr",
  subtitle,
  slots,
  methods: methodsProp,
  onLogin,
  onSuccess,
  onError,
  authBaseUrl,
  rollbackOnAuthFailure = false,
  hideAdvanced = false,
  flatLayout = false,
  layout = "default",
  existingAccountLabel = "I already have an account",
  hideUnavailableNip07 = false,
  requireKeyDownload = false,
  keyFilePrefix,
  allowKeyFile = true,
  showRememberToggle: _showRememberToggle = true,
  methodIcons,
  noExtensionCta,
  profileSetup = false,
  profileRelays,
  nip46Mode = "qr",
  nip46Relays,
  nip46Metadata,
  nip46Perms,
  nip46Connection,
  classes,
  styles,
}: LoginWidgetProps) {
  const login = useLogin();
  const logout = useLogout();
  const createFirst = layout === "create-first";
  const nip07Available = useNip07Available();
  const methods = (methodsProp ?? (createFirst ? CREATE_FIRST_METHODS : DEFAULT_METHODS))
    .filter((m) => m !== "nip07" || nip07Available || !hideUnavailableNip07);
  const wantsNip07 = (methodsProp ?? DEFAULT_METHODS).includes("nip07");
  // Reserved for future remember-me UI; currently a no-op flag.
  void _showRememberToggle;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<
    | { kind: "picker" }
    | { kind: "nip46-form" }
    | { kind: "generate" }
    | { kind: "import" }
  >({ kind: "picker" });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const onErr = (msg: string) => {
    setError(msg);
    onError?.(msg);
  };

  /**
   * Central handler invoked by every login method once it has a signer.
   * Runs in order: setSigner(context) → backend handshake (if configured)
   * → user `onLogin` hook → onSuccess. Errors at any step keep the modal
   * open with an inline message; `rollbackOnAuthFailure` controls whether
   * the local signer is unset on backend failure.
   */
  const handleAttached = async (
    signer: NostrSigner,
    pubkey: string,
    method: LoginMethodId,
    extras?: { nsec?: string; bunkerUri?: string; clientNsec?: string },
  ) => {
    setBusy(true);
    setError(null);
    let signerInContext = false;
    try {
      await login(signer);
      signerInContext = true;

      if (authBaseUrl) {
        try {
          await performBackendAuth(authBaseUrl, signer);
        } catch (err) {
          if (rollbackOnAuthFailure) {
            await logout();
            signerInContext = false;
          }
          throw err;
        }
      }

      if (onLogin) {
        await onLogin({
          signer,
          pubkey,
          method,
          ...(extras?.nsec ? { nsec: extras.nsec } : {}),
          ...(extras?.bunkerUri ? { bunkerUri: extras.bunkerUri } : {}),
          ...(extras?.clientNsec ? { clientNsec: extras.clientNsec } : {}),
        });
      }

      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onErr(msg);
      if (!signerInContext) {
        // Failed before context update → nothing to roll back.
      }
      throw err; // re-throw so the calling method can stop its UI spinner
    } finally {
      setBusy(false);
    }
  };

  const attachedFor = (method: LoginMethodId) =>
    async (
      signer: NostrSigner,
      pubkey: string,
      extras?: { nsec?: string; bunkerUri?: string; clientNsec?: string },
    ) => {
      try {
        await handleAttached(signer, pubkey, method, extras);
      } catch {
        /* error already surfaced via onErr; swallow so methods don't double-handle */
      }
    };

  const methodButton = (m: LoginMethodId, primary = false) => {
    if (m === "nip07") {
      return (
        <Nip07Method
          key="nip07"
          onError={onErr}
          onAttached={attachedFor("nip07")}
          {...(methodIcons?.nip07 !== undefined ? { icon: methodIcons.nip07 } : {})}
        />
      );
    }
    const words = {
      nip46: { icon: methodIcons?.nip46 ?? "🔐", label: "Remote signer (bunker)", hint: "NIP-46 — Amber, Nsec.app", view: "nip46-form" as const },
      generate: { icon: methodIcons?.generate ?? "✨", label: "Create a new account", hint: "Generates a fresh keypair on this device", view: "generate" as const },
      import: createFirst
        ? { icon: methodIcons?.import ?? "🔑", label: "Private key or key file", hint: "Paste your nsec, or upload the key file you saved", view: "import" as const }
        : { icon: methodIcons?.import ?? "🔑", label: "Paste private key", hint: "nsec or 64-char hex — risky in browsers", view: "import" as const },
    }[m];
    return (
      <button
        key={m}
        type="button"
        className={cx("nui-method-button", primary && "nui-method-primary", classes?.method)}
        style={styles?.method}
        onClick={() => setView({ kind: words.view })}
      >
        <span className={cx("nui-method-icon", classes?.methodIcon)} aria-hidden>{words.icon}</span>
        <span className={cx("nui-method-text", classes?.methodText)}>
          <span className={cx("nui-method-label", classes?.methodLabel)}>{words.label}</span>
          <span className={cx("nui-method-hint", classes?.methodHint)}>{words.hint}</span>
        </span>
      </button>
    );
  };
  const existingMethods = methods.filter((m) => m !== "generate");

  const primaryMethods = methods.filter((m) => m === "nip07" || m === "nip46");
  const advancedMethods = methods.filter((m) => m === "generate" || m === "import");

  const ctaToRender =
    noExtensionCta === false
      ? null
      : noExtensionCta !== undefined
        ? noExtensionCta
        : DEFAULT_NO_EXTENSION_CTA;

  return (
    <div className={cx("nui-widget", classes?.root)} style={styles?.root}>
      {slots?.header}

      <div>
        {title && (
          <h2
            className={cx("nui-widget-title", classes?.title)}
            style={styles?.title}
          >
            {title}
          </h2>
        )}
        {subtitle && (
          <p
            className={cx("nui-widget-subtitle", classes?.subtitle)}
            style={styles?.subtitle}
          >
            {subtitle}
          </p>
        )}
      </div>

      {slots?.beforeMethods}

      {error && (
        <div className={cx("nui-error", classes?.error)} style={styles?.error}>
          {error}
        </div>
      )}

      {busy && view.kind !== "picker" && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            color: "var(--nui-muted)",
            fontSize: 13,
          }}
        >
          <span className="nui-spinner" /> Signing in…
        </div>
      )}

      {view.kind === "picker" && createFirst && (
        <>
          <div
            className={cx("nui-widget-methods", "nui-create-first", classes?.methods)}
            style={{ display: "flex", flexDirection: "column", gap: 8, ...styles?.methods }}
          >
            {methods.includes("generate") && methodButton("generate", true)}
            {methods.includes("generate") && existingMethods.length > 0 && (
              <div className={cx("nui-divider", classes?.divider)} style={styles?.divider}>
                {existingAccountLabel}
              </div>
            )}
            {existingMethods.map((m) => methodButton(m))}
          </div>
          {!nip07Available && wantsNip07 && ctaToRender}
        </>
      )}

      {view.kind === "picker" && !createFirst && (
        <>
          <div
            className={cx("nui-widget-methods", classes?.methods)}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              ...styles?.methods,
            }}
          >
            {primaryMethods.includes("nip07") && (
              <Nip07Method
                onError={onErr}
                onAttached={attachedFor("nip07")}
                {...(methodIcons?.nip07 !== undefined ? { icon: methodIcons.nip07 } : {})}
              />
            )}
            {primaryMethods.includes("nip46") && (
              <button
                type="button"
                className={cx("nui-method-button", classes?.method)}
                style={styles?.method}
                onClick={() => setView({ kind: "nip46-form" })}
              >
                <span
                  className={cx("nui-method-icon", classes?.methodIcon)}
                  aria-hidden
                >
                  {methodIcons?.nip46 ?? "🔐"}
                </span>
                <span className={cx("nui-method-text", classes?.methodText)}>
                  <span
                    className={cx("nui-method-label", classes?.methodLabel)}
                  >
                    Remote signer (bunker)
                  </span>
                  <span
                    className={cx("nui-method-hint", classes?.methodHint)}
                  >
                    NIP-46 — Amber, Nsec.app
                  </span>
                </span>
              </button>
            )}
            {flatLayout && advancedMethods.includes("generate") && (
              <button
                type="button"
                className={cx("nui-method-button", classes?.method)}
                style={styles?.method}
                onClick={() => setView({ kind: "generate" })}
              >
                <span className="nui-method-icon" aria-hidden>
                  {methodIcons?.generate ?? "✨"}
                </span>
                <span className="nui-method-text">
                  <span className="nui-method-label">
                    Create a new account
                  </span>
                  <span className="nui-method-hint">
                    Generates a fresh keypair on this device
                  </span>
                </span>
              </button>
            )}
            {flatLayout && advancedMethods.includes("import") && (
              <button
                type="button"
                className={cx("nui-method-button", classes?.method)}
                style={styles?.method}
                onClick={() => setView({ kind: "import" })}
              >
                <span className="nui-method-icon" aria-hidden>
                  {methodIcons?.import ?? "🔑"}
                </span>
                <span className="nui-method-text">
                  <span className="nui-method-label">
                    Paste private key
                  </span>
                  <span className="nui-method-hint">
                    nsec or 64-char hex — risky in browsers
                  </span>
                </span>
              </button>
            )}
          </div>

          {!flatLayout && advancedMethods.length > 0 && !hideAdvanced && (
            <>
              {!showAdvanced ? (
                <button
                  type="button"
                  className={cx("nui-back", classes?.back)}
                  style={{ alignSelf: "center", ...styles?.back }}
                  onClick={() => setShowAdvanced(true)}
                >
                  Advanced ▾
                </button>
              ) : (
                <>
                  <div
                    className={cx("nui-divider", classes?.divider)}
                    style={styles?.divider}
                  >
                    Advanced
                  </div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {advancedMethods.includes("generate") && (
                      <button
                        type="button"
                        className={cx("nui-method-button", classes?.method)}
                        style={styles?.method}
                        onClick={() => setView({ kind: "generate" })}
                      >
                        <span className="nui-method-icon" aria-hidden>
                          {methodIcons?.generate ?? "✨"}
                        </span>
                        <span className="nui-method-text">
                          <span className="nui-method-label">
                            Create a new account
                          </span>
                          <span className="nui-method-hint">
                            Generates a fresh keypair on this device
                          </span>
                        </span>
                      </button>
                    )}
                    {advancedMethods.includes("import") && (
                      <button
                        type="button"
                        className={cx("nui-method-button", classes?.method)}
                        style={styles?.method}
                        onClick={() => setView({ kind: "import" })}
                      >
                        <span className="nui-method-icon" aria-hidden>
                          {methodIcons?.import ?? "🔑"}
                        </span>
                        <span className="nui-method-text">
                          <span className="nui-method-label">
                            Paste private key
                          </span>
                          <span className="nui-method-hint">
                            nsec or 64-char hex — risky in browsers
                          </span>
                        </span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {!nip07Available && wantsNip07 && ctaToRender}
        </>
      )}

      {view.kind === "nip46-form" && (
        <Nip46Method
          inline
          defaultMode={nip46Mode}
          connectionOptions={nip46Connection}
          onError={onErr}
          onAttached={attachedFor("nip46")}
          onBack={() => setView({ kind: "picker" })}
          {...(nip46Relays ? { nostrConnectRelays: nip46Relays } : {})}
          {...(nip46Metadata ? { metadata: nip46Metadata } : {})}
          {...(nip46Perms ? { perms: nip46Perms } : {})}
        />
      )}
      {view.kind === "generate" && (
        <GenerateMethod
          onError={onErr}
          onAttached={attachedFor("generate")}
          onBack={() => setView({ kind: "picker" })}
          profileSetup={profileSetup}
          requireKeyDownload={requireKeyDownload}
          {...(keyFilePrefix ? { keyFilePrefix } : {})}
          {...(profileRelays ? { profileRelays } : {})}
        />
      )}
      {view.kind === "import" && (
        <ImportMethod
          onError={onErr}
          onAttached={attachedFor("import")}
          onBack={() => setView({ kind: "picker" })}
          allowKeyFile={allowKeyFile}
        />
      )}

      {slots?.afterMethods}
      {slots?.footer}
    </div>
  );
}
