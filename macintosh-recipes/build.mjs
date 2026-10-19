import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/app.js", "src/landing.js"],
  bundle: true,
  minify: true,
  format: "esm",
  outdir: "dist",
  target: ["es2022"],
});
for (const f of ["index.html", "recipes.html", "style.css"])
  await copyFile("src/" + f, "dist/" + f);
