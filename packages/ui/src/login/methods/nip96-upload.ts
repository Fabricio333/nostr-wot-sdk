import { finalizeEvent } from "nostr-tools";

/**
 * Upload a file via NIP-96 with a NIP-98 Nostr-signed Authorization header.
 *
 * The endpoint defaults to nostr.build, which is free and CORS-friendly. To
 * use a different host, pass a `serverUrl` whose well-known config returns
 * the upload endpoint, or pass an absolute `uploadUrl` directly.
 *
 * Returns the absolute URL of the uploaded file. Throws on any non-2xx
 * response or malformed reply.
 */
export interface Nip96UploadOptions {
  /** Raw secretKey bytes used to sign the NIP-98 auth event. */
  secretKey: Uint8Array;
  /** Defaults to https://nostr.build. */
  serverUrl?: string;
  /** Skip the well-known lookup and POST straight to this URL. */
  uploadUrl?: string;
}

const DEFAULT_SERVER = "https://nostr.build";
const NIP98_KIND = 27235;

async function resolveUploadUrl(serverUrl: string): Promise<string> {
  const wk = `${serverUrl.replace(/\/$/, "")}/.well-known/nostr/nip96.json`;
  const res = await fetch(wk, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`NIP-96 well-known failed (${res.status})`);
  const json = (await res.json()) as { api_url?: string };
  if (!json.api_url) throw new Error("NIP-96 well-known missing api_url");
  return json.api_url;
}

async function buildNip98Header(args: {
  url: string;
  method: string;
  payloadHashHex: string;
  secretKey: Uint8Array;
}): Promise<string> {
  const event = finalizeEvent(
    {
      kind: NIP98_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["u", args.url],
        ["method", args.method.toUpperCase()],
        ["payload", args.payloadHashHex],
      ],
      content: "",
    },
    args.secretKey,
  );
  const b64 = typeof window === "undefined"
    ? Buffer.from(JSON.stringify(event)).toString("base64")
    : window.btoa(unescape(encodeURIComponent(JSON.stringify(event))));
  return `Nostr ${b64}`;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function uploadViaNip96(
  file: File,
  opts: Nip96UploadOptions,
): Promise<string> {
  const uploadUrl =
    opts.uploadUrl ?? (await resolveUploadUrl(opts.serverUrl ?? DEFAULT_SERVER));
  const buf = await file.arrayBuffer();
  const payloadHash = await sha256Hex(buf);
  const auth = await buildNip98Header({
    url: uploadUrl,
    method: "POST",
    payloadHashHex: payloadHash,
    secretKey: opts.secretKey,
  });

  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: auth },
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}) ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    status?: string;
    nip94_event?: { tags?: string[][] };
  };
  const tags = json.nip94_event?.tags ?? [];
  const urlTag = tags.find((t) => t[0] === "url");
  if (!urlTag || !urlTag[1]) throw new Error("Upload reply missing url tag");
  return urlTag[1];
}
