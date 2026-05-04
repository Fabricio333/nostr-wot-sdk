"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  isNip07Available,
  type NostrSigner,
} from "@nostr-wot/signers";
import { useLogin, useLogout } from "@nostr-wot/data/react";
import { cx } from "../utils";
import type { ClassSlots, LoginMethodId, LoginWidgetSlot, StyleSlots } from "../types";
import { performBackendAuth } from "../auth-handshake";
import { Nip07Method } from "./methods/Nip07Method";
import { Nip46Method } from "./methods/Nip46Method";
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
   * Render every active method in a single flat list — no "Advanced"
   * disclosure, no divider. Useful when you want all four flows visible at
   * once. Default false.
   */
  flatLayout?: boolean;
  /**
   * Per-method icon overrides. Replaces the default emoji in each method
   * card. Pass any `ReactNode` (typically an inline SVG component) keyed by
   * `LoginMethodId` (`nip07`, `nip46`, `generate`, `import`).
   */
  methodIcons?: Partial<Record<LoginMethodId, ReactNode>>;
  /**
   * Which method gets the visually-prominent "recommended" treatment so the
   * user has a clear primary action.
   *   - `"auto"` (default): NIP-07 when a browser extension is detected,
   *     otherwise `generate`. Re-evaluates if an extension is injected late.
   *   - `"none"`: every method renders with equal weight.
   *   - `LoginMethodId`: explicitly recommend that method.
   *
   * Recommended button gets `data-nui-recommended="true"`; others get
   * `data-nui-recommended="false"`. The default stylesheet uses these
   * attributes for the visual contrast.
   */
  recommended?: "auto" | "none" | LoginMethodId;
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
  /**
   * When set, the "Generate" flow exposes an "Email me an encrypted backup"
   * action on the backup screen. The widget NIP-49-encrypts the freshly
   * generated nsec with a user-chosen password and hands the resulting
   * `ncryptsec` to your `onSend` handler — you forward it to your own
   * email API (e.g. Resend, Postmark) from a server route. The plaintext
   * nsec never leaves the browser.
   *
   * Omit to disable the option entirely.
   */
  emailBackup?: {
    /** Server-side dispatcher. Throw to display an inline error. */
    onSend: (payload: {
      email: string;
      ncryptsec: string;
      npub: string;
    }) => Promise<void>;
    /** Minimum password length enforced in the UI. Default 12. */
    minPasswordLength?: number;
    /** Optional copy override shown above the email/password inputs. */
    description?: ReactNode;
  };
  /** Default tab on the NIP-46 form: QR or paste-bunker-URI. Default "qr". */
  nip46Mode?: "qr" | "paste";
  /** Relays to advertise on the nostrconnect QR. */
  nip46Relays?: string[];
  /** App metadata embedded in the nostrconnect QR. */
  nip46Metadata?: { name?: string; url?: string; description?: string; image?: string };
  /** NIP-46 perms string (`sign_event:1,nip44_encrypt,...`). */
  nip46Perms?: string;
  classes?: ClassSlots<LoginWidgetSlot>;
  styles?: StyleSlots<LoginWidgetSlot>;
}

const DEFAULT_METHODS: LoginMethodId[] = ["nip07", "nip46", "generate", "import"];

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
  methods = DEFAULT_METHODS,
  onLogin,
  onSuccess,
  onError,
  authBaseUrl,
  rollbackOnAuthFailure = false,
  hideAdvanced = false,
  flatLayout = false,
  methodIcons,
  recommended = "auto",
  noExtensionCta,
  profileSetup = false,
  profileRelays,
  emailBackup,
  nip46Mode = "qr",
  nip46Relays,
  nip46Metadata,
  nip46Perms,
  classes,
  styles,
}: LoginWidgetProps) {
  const login = useLogin();
  const logout = useLogout();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<
    | { kind: "picker" }
    | { kind: "nip46-form" }
    | { kind: "generate" }
    | { kind: "import" }
  >({ kind: "picker" });
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Re-poll for window.nostr — extensions sometimes inject after first paint.
  const [hasNip07, setHasNip07] = useState<boolean>(() => isNip07Available());
  useEffect(() => {
    if (hasNip07) return;
    const id = window.setInterval(() => {
      if (isNip07Available()) {
        setHasNip07(true);
        window.clearInterval(id);
      }
    }, 400);
    const stop = window.setTimeout(() => window.clearInterval(id), 5000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [hasNip07]);

  const recommendedMethod: LoginMethodId | null =
    recommended === "none"
      ? null
      : recommended === "auto"
        ? hasNip07 && methods.includes("nip07")
          ? "nip07"
          : methods.includes("generate")
            ? "generate"
            : (methods[0] ?? null)
        : methods.includes(recommended)
          ? recommended
          : null;

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
        await onLogin({ signer, pubkey, method });
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
    async (signer: NostrSigner, pubkey: string) => {
      try {
        await handleAttached(signer, pubkey, method);
      } catch {
        /* error already surfaced via onErr; swallow so methods don't double-handle */
      }
    };

  const primaryMethods = flatLayout
    ? methods
    : methods.filter((m) => m === "nip07" || m === "nip46");
  const advancedMethods = flatLayout
    ? []
    : methods.filter((m) => m === "generate" || m === "import");

  const ctaToRender =
    noExtensionCta === false
      ? null
      : noExtensionCta !== undefined
        ? noExtensionCta
        : DEFAULT_NO_EXTENSION_CTA;

  return (
    <div className={cx("nui-widget", classes?.root)} style={styles?.root}>
      {slots?.header}

      {view.kind === "picker" && (
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
      )}

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

      {view.kind === "picker" && (
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
                recommended={recommendedMethod === "nip07"}
                {...(methodIcons?.nip07 ? { icon: methodIcons.nip07 } : {})}
              />
            )}
            {primaryMethods.includes("nip46") && (
              <button
                type="button"
                className={cx("nui-method-button", classes?.method)}
                style={styles?.method}
                data-nui-recommended={recommendedMethod === "nip46" ? "true" : "false"}
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
            {flatLayout && primaryMethods.includes("generate") && (
              <button
                type="button"
                className={cx("nui-method-button", classes?.method)}
                style={styles?.method}
                data-nui-recommended={recommendedMethod === "generate" ? "true" : "false"}
                onClick={() => setView({ kind: "generate" })}
              >
                <span className={cx("nui-method-icon", classes?.methodIcon)} aria-hidden>
                  {methodIcons?.generate ?? "✨"}
                </span>
                <span className="nui-method-text">
                  <span className="nui-method-label">Create a new account</span>
                  <span className="nui-method-hint">
                    Generates a fresh keypair on this device
                  </span>
                </span>
              </button>
            )}
            {flatLayout && primaryMethods.includes("import") && (
              <button
                type="button"
                className={cx("nui-method-button", classes?.method)}
                style={styles?.method}
                data-nui-recommended={recommendedMethod === "import" ? "true" : "false"}
                onClick={() => setView({ kind: "import" })}
              >
                <span className={cx("nui-method-icon", classes?.methodIcon)} aria-hidden>
                  {methodIcons?.import ?? "🔑"}
                </span>
                <span className="nui-method-text">
                  <span className="nui-method-label">Paste private key</span>
                  <span className="nui-method-hint">
                    nsec or 64-char hex — risky in browsers
                  </span>
                </span>
              </button>
            )}
          </div>

          {advancedMethods.length > 0 && !hideAdvanced && (
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
                        data-nui-recommended={recommendedMethod === "generate" ? "true" : "false"}
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
                        data-nui-recommended={recommendedMethod === "import" ? "true" : "false"}
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

          {!isNip07Available() && primaryMethods.includes("nip07") && ctaToRender}
        </>
      )}

      {view.kind === "nip46-form" && (
        <Nip46Method
          inline
          defaultMode={nip46Mode}
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
          {...(profileRelays ? { profileRelays } : {})}
          {...(emailBackup ? { emailBackup } : {})}
        />
      )}
      {view.kind === "import" && (
        <ImportMethod
          onError={onErr}
          onAttached={attachedFor("import")}
          onBack={() => setView({ kind: "picker" })}
        />
      )}

      {slots?.afterMethods}
      {slots?.footer}
    </div>
  );
}
