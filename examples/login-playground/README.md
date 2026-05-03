# @nostr-wot/ui — login playground

Local Vite sandbox for iterating on the login modal/widget. Imports
`@nostr-wot/ui`, `@nostr-wot/data/react`, and `@nostr-wot/signers` directly
from `packages/*/src/` via Vite + tsconfig path aliases — so any edit to a
package source file hot-reloads here without a rebuild.

## Run

From the repo root (so the workspace install picks it up):

```bash
npm install
npm run dev -w @nostr-wot/login-playground
```

Then open http://localhost:5173.

## What's exercised

- All four `LoginMethodId` flows: `nip07`, `nip46`, `generate`, `import`
- The `<LoginButton>` → `<LoginModal>` → `<LoginWidget>` chain
- An inline `<LoginWidget>` mounted next to the modal so you can compare
- Live toggles for `methods`, `hideAdvanced`, `profileSetup`, `nip46Mode`
- A session panel reading `useSession()` — pubkey, signer constructor name,
  NIP-04 / NIP-44 capability flags
- `onLogin` and `onError` callbacks displayed as a status pill

## Editing tips

- Edits to `packages/ui/src/login/**` and `packages/signers/src/**` HMR live.
- `Cmd/Ctrl+Shift+R` to clear the persisted signer (`localStorage: nui:nip46`,
  `nui:nsec`) when testing the auto-restore flow.
- The dev server is locked to port 5173 (`server.strictPort: true`) so the
  NIP-46 nostrconnect callback URL stays stable across restarts.

## Backend handshake (optional)

`auth-handshake.ts` is wired but inactive here — there's no
`@nostr-wot/auth` backend running. To exercise it, point a separate Next.js
app at `@nostr-wot/auth/next`, expose `/api/auth/{challenge,verify,me,logout}`,
then pass `authBaseUrl="..."` to the widget. Out of scope for this
playground.
