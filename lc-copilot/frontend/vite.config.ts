import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // shared/ sits outside the Vite root; both tiers read the same catalogue
  // and seed data so the form can never drift from the server.
  server: {
    port: 5173,
    fs: { allow: [".."] },
    proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } },
  },
});
