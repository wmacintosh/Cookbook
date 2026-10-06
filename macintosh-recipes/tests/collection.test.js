import test from "node:test";
import assert from "node:assert/strict";
import {
  filterRecipes,
  readRoute,
  routeURL,
  reviewComparison,
} from "../src/collection.js";
const recipes = [
  {
    id: "bread",
    contributor_id: "jean",
    document: {
      title: "Bread",
      category: "Breads",
      ingredients: ["Flour"],
      status_review_flag: "verified",
    },
  },
  {
    id: "soup",
    document: { title: "Soup", category: "Soups", ingredients: ["Carrot"] },
  },
];
const contributors = [{ id: "jean", name: "Jean" }];
const category = (r) => r.document.category;
test("combined filters match ingredients, contributors, categories and review status", () => {
  assert.deepEqual(
    filterRecipes(
      recipes,
      {
        query: " flour ",
        contributor: "jean",
        status: "verified",
        category: "Breads",
      },
      contributors,
      category,
    ).map((r) => r.id),
    ["bread"],
  );
  assert.deepEqual(
    filterRecipes(recipes, { query: "Jean" }, contributors, category).map(
      (r) => r.id,
    ),
    ["bread"],
  );
  assert.deepEqual(
    filterRecipes(
      recipes,
      { contributor: "unassigned", status: "review" },
      contributors,
      category,
    ).map((r) => r.id),
    ["soup"],
  );
  assert.equal(
    filterRecipes(
      recipes,
      { query: "Carrot", category: "Breads" },
      contributors,
      category,
    ).length,
    0,
  );
});
test("links round-trip family names and filters without invitation fragments", () => {
  const route = {
    query: "flour & eggs",
    category: "Breads",
    contributor: "jean",
    status: "verified",
    recipe: "family/1",
    tab: "scan",
  };
  const href = routeURL("https://recipes.example/#invite=private", route);
  assert.deepEqual(readRoute(href), route);
  assert.ok(!href.includes("private"));
  assert.equal(
    readRoute("https://recipes.example/?tab=bad&status=bad").tab,
    "recipe",
  );
});
test("review comparison escapes submitted HTML and distinguishes removed and unchanged fields", () => {
  const html = reviewComparison(
    { document: { title: "<script>bad</script>", ingredients: [] } },
    recipes[0],
    contributors,
  );
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Current"));
  assert.ok(html.includes("Proposed"));
  assert.ok(html.includes("Flour"));
  assert.ok(html.includes("Not provided"));
  assert.ok(!html.includes("JSON"));
});
