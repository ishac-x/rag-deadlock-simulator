import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

const isPages = process.env["GITHUB_PAGES"] === "true";

export default defineConfig(({ command }) => ({
  base: isPages ? "/rag-deadlock-simulator/" : "/",
  plugins: [
    tsconfigPaths(),
    tanstackStart(
      isPages
        ? { spa: { enabled: true } }
        : { server: { entry: "server" } },
    ),
    viteReact(),
    tailwindcss(),
    ...(command === "build" && !isPages ? [nitro()] : []),
  ],
}));