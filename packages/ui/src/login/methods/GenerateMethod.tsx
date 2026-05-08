"use client";

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
} from "nostr-tools";
import { PrivateKeySigner, type NostrSigner } from "@nostr-wot/signers";
import { getPool } from "@nostr-wot/data";
import {
  localStorageSignerStorage,
  SIGNER_STORAGE_KEY_NSEC,
  type SignerStorage,
} from "../../signer-storage";
import { useSignerStorage } from "../../signer-storage-context";
import { uploadViaNip96 } from "./nip96-upload";

const abbreviate = (s: string, head = 10, tail = 8) =>
  s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;

export interface GenerateMethodProps {
  onError: (msg: string) => void;
  onAttached: (
    signer: NostrSigner,
    pubkey: string,
    extra?: { nsec?: string },
  ) => void | Promise<void>;
  /** Pass undefined to hide the back button (used when the picker is unreachable). */
  onBack?: () => void;
  /** When true, asks for name/about/picture and publishes a kind-0 after the user backs up their key. */
  profileSetup?: boolean;
  /** Relays to publish the profile to. Defaults to a small built-in set. */
  profileRelays?: string[];
  /** Show the "Remember on this device" toggle. Default true.
   *  Set false when the host has its own session restoration (so the SDK's
   *  localStorage write would be redundant or misleading). */
  showRememberToggle?: boolean;
  /** Optional encrypted-backup-via-email config. Adds a button on the
   *  backup screen that NIP-49-encrypts the nsec and hands the
   *  `ncryptsec` to the consumer's server-side dispatcher. */
  emailBackup?: {
    onSend: (payload: { email: string; ncryptsec: string; npub: string }) => Promise<void>;
    minPasswordLength?: number;
    description?: ReactNode;
  };
}

const DEFAULT_PROFILE_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://purplepag.es",
];

export function GenerateMethod({
  onError,
  onAttached,
  onBack,
  profileSetup = false,
  profileRelays = DEFAULT_PROFILE_RELAYS,
  showRememberToggle = true,
  emailBackup,
}: GenerateMethodProps) {
  const storage = useSignerStorage();
  const [acknowledged, setAcknowledged] = useState(false);
  const [remember, setRemember] = useState(false);
  const [step, setStep] = useState<"backup" | "email-backup" | "profile">("backup");
  const [emailValue, setEmailValue] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const minPasswordLength = emailBackup?.minPasswordLength ?? 12;
  const [publishing, setPublishing] = useState(false);
  const [revealNsec, setRevealNsec] = useState(false);
  const [copied, setCopied] = useState<"npub" | "nsec" | null>(null);

  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [picture, setPicture] = useState("");
  const [banner, setBanner] = useState("");
  const [pictureUploading, setPictureUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [pictureMode, setPictureMode] = useState<"upload" | "url">("upload");
  const [bannerMode, setBannerMode] = useState<"upload" | "url">("upload");

  const pictureInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  const generated = useMemo(() => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const nsec = nip19.nsecEncode(sk);
    const npub = nip19.npubEncode(pk);
    return { sk, pk, nsec, npub };
  }, []);

  const handleCopy = async (which: "npub" | "nsec", val: string) => {
    try {
      await navigator.clipboard?.writeText(val);
      setCopied(which);
      window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1400);
    } catch {
      /* user-denied clipboard — silent */
    }
  };

  const download = () => {
    const blob = new Blob(
      [`Nostr private key (nsec)\n\n${generated.nsec}\n\nPublic key (npub)\n\n${generated.npub}\n\nKEEP THIS FILE PRIVATE.\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nostr-key-${generated.npub.slice(0, 12)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendEmailBackup = async () => {
    if (!emailBackup) return;
    const email = emailValue.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      onError("Enter a valid email address");
      return;
    }
    if (emailPassword.length < minPasswordLength) {
      onError(`Backup password must be at least ${minPasswordLength} characters`);
      return;
    }
    setEmailSending(true);
    try {
      const nip49 = await import("nostr-tools/nip49");
      const ncryptsec = nip49.encrypt(generated.sk, emailPassword);
      await emailBackup.onSend({ email, ncryptsec, npub: generated.npub });
      setEmailSent(true);
      setStep("backup");
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setEmailSending(false);
    }
  };

  const attach = async () => {
    if (remember) {
      try {
        await storage.setItem(SIGNER_STORAGE_KEY_NSEC, generated.nsec);
      } catch {
        /* ignore quota */
      }
    }
    const signer = new PrivateKeySigner(generated.sk);
    await onAttached(signer, generated.pk, { nsec: generated.nsec });
  };

  const continueToNext = async () => {
    try {
      if (profileSetup) {
        setStep("profile");
        return;
      }
      await attach();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const onPickImage =
    (kind: "picture" | "banner") =>
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // reset so re-picking same file works
      if (!file) return;
      const setBusy = kind === "picture" ? setPictureUploading : setBannerUploading;
      const setVal = kind === "picture" ? setPicture : setBanner;
      setBusy(true);
      try {
        const url = await uploadViaNip96(file, { secretKey: generated.sk });
        setVal(url);
      } catch (err) {
        onError(
          `${kind} upload failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setBusy(false);
      }
    };

  const submitProfile = async (skipped: boolean) => {
    setPublishing(true);
    try {
      if (!skipped) {
        const content: Record<string, string> = {};
        if (name.trim()) {
          content.name = name.trim();
          content.display_name = name.trim();
        }
        if (about.trim()) content.about = about.trim();
        if (picture.trim()) content.picture = picture.trim();
        if (banner.trim()) content.banner = banner.trim();
        if (Object.keys(content).length > 0) {
          const event = finalizeEvent(
            {
              kind: 0,
              created_at: Math.floor(Date.now() / 1000),
              tags: [],
              content: JSON.stringify(content),
            },
            generated.sk,
          );
          try {
            const pool = getPool();
            await Promise.allSettled(pool.publish(profileRelays, event));
          } catch {
            /* relay publish failures are non-fatal — the user is still logged in */
          }
        }
      }
      await attach();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  };

  if (step === "email-backup" && emailBackup) {
    const canSend =
      !emailSending &&
      emailValue.trim().length > 0 &&
      emailPassword.length >= minPasswordLength;
    return (
      <div className="nui-form">
        <button
          type="button"
          className="nui-back-pill"
          onClick={() => setStep("backup")}
          aria-label="Back to backup step"
        >
          ← Back
        </button>
        <div className="nui-form-head">
          <h3 className="nui-form-title">Email me an encrypted backup</h3>
          <p className="nui-form-sub">
            {emailBackup.description ?? (
              <>
                Your nsec will be encrypted in your browser with your password
                (NIP-49) — only the encrypted blob leaves this device. You'll
                need this same password to restore.
              </>
            )}
          </p>
        </div>
        <div className="nui-field">
          <label className="nui-field-label" htmlFor="nui-eb-email">
            Email
          </label>
          <input
            id="nui-eb-email"
            className="nui-input"
            type="email"
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
            placeholder="you@example.com"
            disabled={emailSending}
            autoFocus
          />
        </div>
        <div className="nui-field">
          <label className="nui-field-label" htmlFor="nui-eb-pass">
            Backup password
          </label>
          <input
            id="nui-eb-pass"
            className="nui-input"
            type="password"
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            placeholder={`At least ${minPasswordLength} characters`}
            disabled={emailSending}
          />
          <p className="nui-field-hint">
            You'll need this password to decrypt the backup. We can't recover it.
          </p>
        </div>
        <button
          type="button"
          className="nui-pill nui-pill-primary"
          onClick={() => void sendEmailBackup()}
          disabled={!canSend}
        >
          {emailSending ? (
            <>
              <span className="nui-spinner-sm" /> Sending…
            </>
          ) : (
            "Send encrypted backup"
          )}
        </button>
      </div>
    );
  }

  if (step === "profile") {
    return (
      <div className="nui-form">
        <button
          type="button"
          className="nui-back-pill"
          onClick={() => setStep("backup")}
          aria-label="Back to backup step"
        >
          ← Back
        </button>

        <div className="nui-form-head">
          <h3 className="nui-form-title">Set up your profile</h3>
          <p className="nui-form-sub">
            Optional — you can fill these in later from any Nostr client.
          </p>
        </div>

        <ProfileMedia
          banner={banner}
          setBanner={setBanner}
          bannerMode={bannerMode}
          setBannerMode={setBannerMode}
          bannerUploading={bannerUploading}
          onPickBanner={onPickImage("banner")}
          bannerInputRef={bannerInputRef}
          picture={picture}
          setPicture={setPicture}
          pictureMode={pictureMode}
          setPictureMode={setPictureMode}
          pictureUploading={pictureUploading}
          onPickPicture={onPickImage("picture")}
          pictureInputRef={pictureInputRef}
        />

        <div className="nui-field">
          <label className="nui-field-label" htmlFor="nui-pf-name">
            Display name
          </label>
          <input
            id="nui-pf-name"
            className="nui-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Satoshi"
            autoFocus
          />
        </div>

        <div className="nui-field">
          <label className="nui-field-label" htmlFor="nui-pf-about">
            About
          </label>
          <textarea
            id="nui-pf-about"
            className="nui-input nui-textarea"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="Builder, chef, occasional cyclist."
            rows={3}
          />
        </div>

        <div className="nui-actions-stack">
          <button
            type="button"
            className="nui-pill nui-pill-primary"
            onClick={() => void submitProfile(false)}
            disabled={publishing || pictureUploading || bannerUploading}
          >
            {publishing ? (
              <>
                <span className="nui-spinner-sm" /> Publishing…
              </>
            ) : (
              "Save profile and continue"
            )}
          </button>
          <button
            type="button"
            className="nui-pill nui-pill-ghost"
            onClick={() => void submitProfile(true)}
            disabled={publishing || pictureUploading || bannerUploading}
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="nui-form">
      {onBack && (
        <button
          type="button"
          className="nui-back-pill"
          onClick={onBack}
          aria-label="Back"
        >
          ← Back
        </button>
      )}

      <div className="nui-form-head">
        <h3 className="nui-form-title">Your new key</h3>
        <p className="nui-form-sub">
          Back this up <strong>before</strong> you continue. Lose it and your
          identity is gone — there's no recovery.
        </p>
      </div>

      <KeyCard
        label="Public key (npub)"
        value={generated.npub}
        display={abbreviate(generated.npub, 12, 10)}
        copied={copied === "npub"}
        onCopy={() => void handleCopy("npub", generated.npub)}
      />

      <KeyCard
        label="Private key (nsec) · keep secret"
        tone="danger"
        value={generated.nsec}
        display={
          revealNsec ? abbreviate(generated.nsec, 14, 10) : "•".repeat(28)
        }
        copied={copied === "nsec"}
        onCopy={() => void handleCopy("nsec", generated.nsec)}
        secondary={
          <>
            <button
              type="button"
              className="nui-action-chip"
              onClick={() => setRevealNsec((r) => !r)}
            >
              {revealNsec ? "Hide" : "Reveal"}
            </button>
            <button type="button" className="nui-action-chip" onClick={download}>
              Download .txt
            </button>
            {emailBackup && (
              <button
                type="button"
                className={`nui-action-chip${emailSent ? " is-copied" : ""}`}
                onClick={() => setStep("email-backup")}
              >
                {emailSent ? "Email sent" : "Email backup"}
              </button>
            )}
          </>
        }
      />

      <label className="nui-confirm-card">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        <span>
          I have backed up my nsec. I understand that losing it means losing
          access to this account permanently.
        </span>
      </label>

      {showRememberToggle && (
        <label className="nui-toggle-row">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Stay signed in on this device
        </label>
      )}

      <button
        type="button"
        className="nui-pill nui-pill-primary"
        onClick={continueToNext}
        disabled={!acknowledged}
      >
        Continue
      </button>
    </div>
  );
}

function KeyCard({
  label,
  display,
  value,
  copied,
  onCopy,
  tone,
  secondary,
}: {
  label: string;
  display: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  tone?: "danger";
  secondary?: React.ReactNode;
}) {
  return (
    <div className={`nui-keycard${tone === "danger" ? " is-danger" : ""}`}>
      <div className="nui-keycard-label">{label}</div>
      <div className="nui-keycard-row">
        <code className="nui-keycard-value" title={value}>
          {display}
        </code>
        <button
          type="button"
          className={`nui-action-chip${copied ? " is-copied" : ""}`}
          onClick={onCopy}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {secondary && <div className="nui-keycard-secondary">{secondary}</div>}
    </div>
  );
}

const CameraIcon = (p: { size?: number }) => (
  <svg
    width={p.size ?? 18}
    height={p.size ?? 18}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const LinkIcon = (p: { size?: number }) => (
  <svg
    width={p.size ?? 14}
    height={p.size ?? 14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);

const UserIcon = (p: { size?: number }) => (
  <svg
    width={p.size ?? 32}
    height={p.size ?? 32}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

function ProfileMedia({
  banner,
  setBanner,
  bannerMode,
  setBannerMode,
  bannerUploading,
  onPickBanner,
  bannerInputRef,
  picture,
  setPicture,
  pictureMode,
  setPictureMode,
  pictureUploading,
  onPickPicture,
  pictureInputRef,
}: {
  banner: string;
  setBanner: (v: string) => void;
  bannerMode: "upload" | "url";
  setBannerMode: (m: "upload" | "url") => void;
  bannerUploading: boolean;
  onPickBanner: (e: ChangeEvent<HTMLInputElement>) => void;
  bannerInputRef: React.MutableRefObject<HTMLInputElement | null>;
  picture: string;
  setPicture: (v: string) => void;
  pictureMode: "upload" | "url";
  setPictureMode: (m: "upload" | "url") => void;
  pictureUploading: boolean;
  onPickPicture: (e: ChangeEvent<HTMLInputElement>) => void;
  pictureInputRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="nui-profile-media">
      {/* Banner zone */}
      <div className="nui-banner-slot">
        <button
          type="button"
          className="nui-banner-btn"
          onClick={() => bannerInputRef.current?.click()}
          disabled={bannerUploading}
          aria-label={banner ? "Replace banner" : "Upload banner"}
        >
          {banner && (
            <img src={banner} alt="" className="nui-banner-img" />
          )}
          <span className="nui-banner-overlay" data-filled={banner ? "true" : "false"}>
            {bannerUploading ? (
              <span className="nui-spinner-sm" />
            ) : (
              <>
                <CameraIcon />
                <span>{banner ? "Replace banner" : "Add banner"}</span>
              </>
            )}
          </span>
        </button>
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/*"
          onChange={onPickBanner}
          style={{ display: "none" }}
        />
        <div className="nui-media-actions nui-media-actions-banner">
          <button
            type="button"
            className="nui-icon-btn"
            onClick={() =>
              setBannerMode(bannerMode === "upload" ? "url" : "upload")
            }
            title={bannerMode === "upload" ? "Paste URL instead" : "Upload file instead"}
            aria-label={
              bannerMode === "upload" ? "Paste URL instead" : "Upload file instead"
            }
          >
            <LinkIcon />
          </button>
          {banner && !bannerUploading && (
            <button
              type="button"
              className="nui-icon-btn"
              onClick={() => setBanner("")}
              title="Remove banner"
              aria-label="Remove banner"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Avatar overlapping the banner */}
      <div className="nui-avatar-slot">
        <button
          type="button"
          className="nui-avatar-btn"
          onClick={() => pictureInputRef.current?.click()}
          disabled={pictureUploading}
          aria-label={picture ? "Replace profile picture" : "Upload profile picture"}
        >
          {picture ? (
            <img src={picture} alt="" className="nui-avatar-img" />
          ) : (
            <UserIcon />
          )}
          <span className="nui-avatar-overlay" data-filled={picture ? "true" : "false"}>
            {pictureUploading ? <span className="nui-spinner-sm" /> : <CameraIcon size={14} />}
          </span>
        </button>
        <input
          ref={pictureInputRef}
          type="file"
          accept="image/*"
          onChange={onPickPicture}
          style={{ display: "none" }}
        />
      </div>

      {/* URL-mode inline editors only show when toggled */}
      {bannerMode === "url" && (
        <input
          className="nui-input nui-media-url"
          type="url"
          value={banner}
          onChange={(e) => setBanner(e.target.value)}
          placeholder="Banner URL — https://…"
        />
      )}
      {pictureMode === "url" && (
        <div className="nui-media-url-row">
          <input
            className="nui-input"
            type="url"
            value={picture}
            onChange={(e) => setPicture(e.target.value)}
            placeholder="Profile picture URL — https://…"
          />
          <button
            type="button"
            className="nui-icon-btn"
            onClick={() => setPictureMode("upload")}
            title="Switch to upload"
            aria-label="Switch to upload"
          >
            <CameraIcon size={14} />
          </button>
        </div>
      )}

      <p className="nui-media-hint">
        Files upload to nostr.build · signed with your new key (NIP-96 + NIP-98).
      </p>
    </div>
  );
}

/** Read a remembered nsec from storage; returns a signer or null. */
export async function tryRestoreGeneratedOrImported(
  storage: SignerStorage = localStorageSignerStorage,
): Promise<PrivateKeySigner | null> {
  try {
    const nsec = await storage.getItem(SIGNER_STORAGE_KEY_NSEC);
    if (!nsec) return null;
    const decoded = nip19.decode(nsec);
    if (decoded.type !== "nsec") return null;
    return new PrivateKeySigner(decoded.data);
  } catch {
    return null;
  }
}

export async function clearPersistedNsec(
  storage: SignerStorage = localStorageSignerStorage,
): Promise<void> {
  await storage.removeItem(SIGNER_STORAGE_KEY_NSEC);
}
