import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base './' makes the build work from any sub-path (e.g. GitHub Pages /floods/)
export default defineConfig({
  base: "./",
  plugins: [react()],
});
