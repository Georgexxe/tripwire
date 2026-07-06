import { defineConfig } from "vite";
export default defineConfig({
  base: "./", // relative asset paths so the PWA works at a domain root or a subpath (e.g. GitHub Pages)
  server: { host: true }, // use `vite --host` + a tunnel/HTTPS for phone camera access
  build: { target: "es2022" },
});
