---
"@nostr-wot/ui": minor
---

Login widget: a `layout="create-first"` option that leads with "Create a new account" and puts the ways in for an existing account under an "I already have an account" divider, in `methods` order; `hideUnavailableNip07` to leave the browser-extension method out when no `window.nostr` is there (checked again for a few seconds and on focus); `requireKeyDownload` so a new account's key file must be saved before Continue; and "Upload key file" on the import step (`allowKeyFile`, default on), which reads the nsec back out of that file. `extractSecretKey`, `keyFileText`, `keyFileName` and `downloadKeyFile` are exported.
