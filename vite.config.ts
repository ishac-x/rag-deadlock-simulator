import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  plugins: [
    tsconfigPaths(),
    tanstackStart({
      // Use src/server.ts as the server entry (SSR error wrapper).
      server: { entry: "server" },
    }),
    viteReact(),
    tailwindcss(),
    // Production server bundle only; preset is auto-detected from the host (Vercel, Netlify, Node, ...).
    ...(command === "build" ? [nitro()] : []),
  ],
}));
