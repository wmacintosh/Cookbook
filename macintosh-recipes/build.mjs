import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/app.js"],
  bundle: true,
  minify: true,
  format: "esm",
  outfile: "dist/app.js",
  target: ["es2022"],
});
for (const f of ["index.html", "style.css"])
  await copyFile("src/" + f, "dist/" + f);
