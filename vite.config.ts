import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Development-only developer sign-in must never reach a production bundle, however the build is started.
// See docs/DECISIONS.md "Developer sign-in".
const forbiddenInProduction = ["developer-sign-in-panel", "developerSignIn", "Developer sign-in"];
function excludeDeveloperSignIn(): Plugin {
  let production = false;
  return {
    name: "exclude-developer-sign-in",
    apply: "build",
    configResolved(config) { production = config.isProduction; },
    generateBundle(_options, bundle) {
      if (!production) return;
      const found = Object.values(bundle).flatMap(file => {
        const text = file.type === "chunk" ? file.code : typeof file.source === "string" ? file.source : "";
        return forbiddenInProduction.filter(marker => text.includes(marker)).map(marker => `${file.fileName}: ${marker}`);
      });
      if (found.length) this.error(`Production bundle contains development-only developer sign-in code:\n${found.join("\n")}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), excludeDeveloperSignIn()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: { sourcemap: false },
});
