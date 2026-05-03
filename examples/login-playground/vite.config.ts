import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const pkg = (sub: string) => resolve(__dirname, "../../packages", sub);

// Alias each @nostr-wot/* import (and its subpaths) to the package source so
// edits to packages/*/src/** hot-reload here without a rebuild. Order matters:
// more specific subpath aliases must come before the bare-package alias.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@nostr-wot/ui/styles.css", replacement: pkg("ui/src/styles.css") },
      { find: "@nostr-wot/ui", replacement: pkg("ui/src/index.ts") },
      { find: /^@nostr-wot\/data\/react$/, replacement: pkg("data/src/react/index.ts") },
      { find: /^@nostr-wot\/data\/cache$/, replacement: pkg("data/src/cache/index.ts") },
      { find: /^@nostr-wot\/data$/, replacement: pkg("data/src/index.ts") },
      { find: "@nostr-wot/signers", replacement: pkg("signers/src/index.ts") },
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    // The aliased packages live outside this workspace's node_modules, so let
    // Vite see them as source instead of pre-bundling.
    exclude: ["@nostr-wot/ui", "@nostr-wot/data", "@nostr-wot/signers"],
  },
});
