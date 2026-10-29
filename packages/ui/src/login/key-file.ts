import { nip19 } from "nostr-tools";

/**
 * The backup file a new account downloads (`GenerateMethod`) and that
 * `ImportMethod` reads back: plain text, the nsec on its own line, so it
 * also works pasted whole into the key field.
 */
export function keyFileText(nsec: string, npub: string): string {
  return `Nostr private key (nsec)\n\n${nsec}\n\nPublic key (npub)\n\n${npub}\n\nKEEP THIS FILE PRIVATE. Anyone with the nsec can use your account.\nTo log in again, upload this file or paste the nsec.\n`;
}

export function keyFileName(npub: string): string {
  return `nostr-key-${npub.slice(0, 12)}.txt`;
}

/** Saves the key file through a temporary link. */
export function downloadKeyFile(nsec: string, npub: string): void {
  const blob = new Blob([keyFileText(nsec, npub)], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = keyFileName(npub);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const NSEC = /nsec1[02-9ac-hj-np-z]{58}/i;
const HEX = /^\s*([0-9a-f]{64})\s*$/im;

/**
 * The private key in a pasted value or a key file's text: the first valid
 * nsec anywhere in it, else a line that is exactly 64 hex characters.
 * Returns `null` when there is none (an npub alone is not a key).
 */
export function extractSecretKey(text: string): { secretKey: Uint8Array; nsec: string } | null {
  const bech = text.match(NSEC)?.[0];
  if (bech) {
    try {
      const decoded = nip19.decode(bech.toLowerCase());
      if (decoded.type === "nsec") return { secretKey: decoded.data, nsec: nip19.nsecEncode(decoded.data) };
    } catch {
      /* not a valid nsec: fall through to hex */
    }
  }
  const hex = text.match(HEX)?.[1];
  if (!hex) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return { secretKey: bytes, nsec: nip19.nsecEncode(bytes) };
}
