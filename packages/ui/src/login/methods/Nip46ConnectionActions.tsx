"use client";

import { useState } from "react";
import { AnchorButton, Button } from "../../primitives/Button";

export interface Nip46ConnectionOptions {
  labels?: {
    openSigner?: string;
    regenerate?: string;
    qrCopy?: string;
    signerHint?: string;
    pasteUri?: string;
    copyUri?: string;
    copied?: string;
    copyFailed?: string;
    fallbackHint?: string;
  };
  /** Customize platform handoff, for example an Android intent. The original URI is always copied. */
  signerHref?: (uri: string, userAgent: string) => string;
  /** Optional host clipboard adapter. Return false when copying is unavailable. */
  copyUri?: (uri: string) => Promise<boolean>;
  /** Copy the connection URI when following the signer link. Defaults to false. */
  copyOnOpen?: boolean;
}

async function copyConnectionUri(uri: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
  await navigator.clipboard.writeText(uri);
  return true;
}

/** One native signer link and its clipboard fallback; remount when the pairing URI changes. */
export function Nip46ConnectionActions({ uri, qrSvg, onRetry, options = {} }: { uri: string; qrSvg?: string; onRetry?: () => void; options?: Nip46ConnectionOptions }) {
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const labels = options.labels;
  const copy = async () => {
    setCopyState("copying");
    try {
      setCopyState(await (options.copyUri ?? copyConnectionUri)(uri) ? "copied" : "failed");
    } catch {
      setCopyState("failed");
    }
  };
  const href = options.signerHref?.(uri, typeof navigator === "undefined" ? "" : navigator.userAgent) ?? uri;
  return (
    <>
      {qrSvg && (
        <div className="nui-qr-surface">
          <button type="button" className="nui-qr" aria-label={labels?.qrCopy ?? "Copy connection URI from QR code"} onClick={() => { void copy(); }} dangerouslySetInnerHTML={{ __html: qrSvg }} />
          {onRetry && <button type="button" className="nui-qr-retry" aria-label={labels?.regenerate ?? "Regenerate connection code"} onClick={onRetry}><span aria-hidden>↻</span></button>}
        </div>
      )}
      <span className="nui-qr-copy-status" role="status">{copyState === "copied" ? labels?.copied ?? "Copied" : copyState === "failed" ? labels?.copyFailed ?? "Could not copy" : ""}</span>
      <AnchorButton
        variant="primary"
        size="lg"
        fullWidth
        href={href}
        rel="noopener noreferrer"
        trailingIcon={<span aria-hidden>↗</span>}
        onClick={options.copyOnOpen ? () => { void copy(); } : undefined}
      >
        {labels?.openSigner ?? "Open in signer app"}
      </AnchorButton>
      <div className="nui-qr-actions">
        <Button variant="secondary" size="sm" fullWidth loading={copyState === "copying"} onClick={() => { void copy(); }}>
          {copyState === "copied" ? labels?.copied ?? "Copied" : copyState === "failed" ? labels?.copyFailed ?? "Could not copy" : labels?.copyUri ?? "Copy connect URI"}
        </Button>
        {labels?.fallbackHint && <p className="nui-signer-copy-hint">{labels.fallbackHint}</p>}
      </div>
    </>
  );
}
