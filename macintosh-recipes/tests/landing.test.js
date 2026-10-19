import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
const source = (
  await readFile(new URL("../src/landing.js", import.meta.url), "utf8")
).replace(/^import .*;\n/, "");
function openLanding(href) {
  let redirected = null,
    tracked = false;
  runInNewContext(source, {
    URL,
    URLSearchParams,
    location: {
      href,
      replace: (url) => {
        redirected = url;
      },
    },
    inject: () => {
      tracked = true;
    },
  });
  return { redirected, tracked };
}
test("home stays on dedication until the reader enters the collection", async () => {
  assert.deepEqual(openLanding("https://recipes.example/"), {
    redirected: null,
    tracked: true,
  });
  const home = await readFile(
    new URL("../src/index.html", import.meta.url),
    "utf8",
  );
  const recipes = await readFile(
    new URL("../src/recipes.html", import.meta.url),
    "utf8",
  );
  assert.match(home, /Shirley MacIntosh/);
  assert.match(home, /href="\/recipes.html"/);
  assert.doesNotMatch(home, /id="authForm"|id="collection"/);
  assert.doesNotMatch(recipes, /class="dedication"/);
  assert.match(recipes, /id="collection"/);
});
test("existing recipe links preserve their recipe, filters and scan tab", () => {
  const result = openLanding(
    "https://recipes.example/?recipe=bread&tab=scan&q=flour",
  );
  assert.equal(
    result.redirected,
    "https://recipes.example/recipes.html?recipe=bread&tab=scan&q=flour",
  );
  assert.equal(result.tracked, false);
});
test("existing invitation links preserve the private token without tracking it", () => {
  const result = openLanding("https://recipes.example/#invite=private-token");
  assert.equal(
    result.redirected,
    "https://recipes.example/recipes.html#invite=private-token",
  );
  assert.equal(result.tracked, false);
});
