import { defineConfig } from "vite";
export default defineConfig({
  server: { host: true }, // use `vite --host` + a tunnel/HTTPS for phone camera access
  build: { target: "es2022" },
});
