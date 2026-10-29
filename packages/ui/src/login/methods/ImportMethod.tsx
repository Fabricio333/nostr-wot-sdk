"use client";

import { useRef, useState } from "react";
import { PrivateKeySigner, type NostrSigner } from "nostr-wot-sdk/signers";
import { SIGNER_STORAGE_KEY_NSEC } from "../../signer-storage";
import { useSignerStorage } from "../../signer-storage-context";
import { extractSecretKey } from "../key-file";

export interface ImportMethodExtras {
  /** The imported nsec (bech32). When the user pasted hex, this is the
   *  bech32 encoding of those bytes. */
  nsec: string;
}

export function ImportMethod({
  onError,
  onAttached,
  onBack,
  allowKeyFile = true,
}: {
  onError: (msg: string) => void;
  onAttached: (
    signer: NostrSigner,
    pubkey: string,
    extras?: ImportMethodExtras,
  ) => void | Promise<void>;
  onBack: () => void;
  /** Offer "Upload key file" next to the field: a .txt holding the nsec, such as the
   *  one `GenerateMethod` downloads. Default true. */
  allowKeyFile?: boolean;
}) {
  const storage = useSignerStorage();
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const submit = async (raw: string = value) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const key = extractSecretKey(trimmed);
      if (!key) throw new Error("Paste an nsec1… or a 64-char hex private key.");
      const { secretKey, nsec } = key;
      const signer = new PrivateKeySigner(secretKey);
      if (remember) {
        try {
          await storage.setItem(SIGNER_STORAGE_KEY_NSEC, nsec);
        } catch {
          /* ignore */
        }
      }
      const pubkey = await signer.getPublicKey();
      await onAttached(signer, pubkey, { nsec });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button type="button" className="nui-back" onClick={onBack}>
        ← Back
      </button>

      <p className="nui-warning">
        ⚠️ Pasting your private key into a web page is risky. Prefer a browser
        extension (NIP-07) or a remote signer (NIP-46) when possible.
      </p>

      <input
        className="nui-input"
        type="password"
        autoFocus
        placeholder="nsec1… or 64-char hex"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
      />

      {allowKeyFile && (
        <>
          <div className="nui-divider">or</div>
          <button
            type="button"
            className="nui-method-button nui-key-file-button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            <span className="nui-method-icon" aria-hidden>📄</span>
            <span className="nui-method-text">
              <span className="nui-method-label">Upload key file</span>
              <span className="nui-method-hint">The .txt you saved when you created the account</span>
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".txt,text/plain"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 64 * 1024) { onError("That file is too big to be a key file."); return; }
              void file.text().then((text) => {
                if (!extractSecretKey(text)) { onError("No private key (nsec) found in that file."); return; }
                void submit(text);
              }, () => onError("Couldn't read that file."));
            }}
          />
        </>
      )}

      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontSize: 13,
          color: "var(--nui-muted)",
        }}
      >
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        Remember on this device
      </label>

      <button
        type="button"
        className="nui-login-button"
        onClick={() => void submit()}
        disabled={busy || !value}
        style={{ width: "100%", justifyContent: "center" }}
      >
        {busy ? <>Signing in <span className="nui-spinner" /></> : "Sign in"}
      </button>
    </div>
  );
}
