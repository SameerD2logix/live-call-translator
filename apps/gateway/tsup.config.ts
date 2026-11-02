import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // The shared protocol package ships TypeScript source, so bundle it. npm deps stay external.
  noExternal: ["@lct/protocol"],
});
