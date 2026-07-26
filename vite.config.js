import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // Les fichiers de public/donnees/ peuvent être nombreux et volumineux ;
    // on veut savoir si le bundle JS enfle, pas si les données le font.
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
  },
});
