import { test } from "node:test";
import assert from "node:assert/strict";
import { auditRecipes } from "../src/recipe-quality.js";
const recipe = (id, ingredients, instructions) => ({
  id,
  document: { title: id, ingredients, instructions },
});
test("duplicates ignore step numbering but preserve quantities and variations", () => {
  const audit = auditRecipes([
    recipe("a", ["1/2 cup flour"], ["1. Mix."]),
    recipe("b", ["1/2 cup flour"], ["Mix."]),
    recipe("c", ["1/4 cup flour"], ["Mix."]),
  ]);
  assert.deepEqual(audit.get("a").duplicates, ["b"]);
  assert.deepEqual(audit.get("c").duplicates, []);
});
test("empty records are not duplicates and missing directions warrant review", () => {
  const audit = auditRecipes([
    recipe("a", [], []),
    recipe("b", [], []),
    recipe("c", ["Mix and bake."], []),
    recipe("d", ["Coming Soon - Recipe Details to be Added"], []),
  ]);
  assert.equal(audit.get("a").empty, true);
  assert.deepEqual(audit.get("a").duplicates, []);
  assert.equal(audit.get("c").missing, true);
  assert.equal(audit.get("d").placeholder, true);
});
