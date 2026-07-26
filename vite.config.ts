import { defineConfig, type Plugin } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";

// Dev-only: the browser can't write to disk, so the app POSTs its end-of-session
// diagnostics here and we drop them as a file Claude can read directly, instead
// of the user having to copy/paste console output.
function testArtifactBridge(): Plugin {
  return {
    name: "test-artifact-bridge",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__test-artifact", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          mkdirSync(".claude-test-artifacts", { recursive: true });
          writeFileSync(".claude-test-artifacts/latest.json", body);
          res.statusCode = 204;
          res.end();
        });
      });
    }
  };
}

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist"
  },
  plugins: [testArtifactBridge()]
});
