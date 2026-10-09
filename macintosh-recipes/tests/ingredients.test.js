import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseIngredient,
  ingredientLine,
  ingredientSuggestions,
} from "../src/ingredients.js";
test("source wording survives untouched ingredient editing", () => {
  for (const text of [
    "1 1/2 cups Flour, sifted",
    "½ tsp. salt",
    "2 Tbsp butter",
    "Sauce:",
    "Salt to taste",
    "1–2 (14 oz) cans tomatoes",
    "  3 eggs  ",
  ]) {
    assert.equal(ingredientLine(parseIngredient(text)), text);
  }
});
test("quantities and units can change without rewriting ingredient names", () => {
  const row = parseIngredient("½ tsp. salt");
  assert.equal(row.quantity, "½");
  assert.equal(row.unit, "tsp.");
  row.quantity = "1/4";
  row.unit = "tsp";
  assert.equal(ingredientLine(row), "1/4 tsp salt");
  const mixed = parseIngredient("1 1/2 cups flour");
  assert.equal(mixed.quantity, "1 1/2");
  assert.equal(mixed.ingredient, "flour");
});
test("ingredient suggestions come from source ingredients and exclude headings", () => {
  assert.deepEqual(
    ingredientSuggestions([
      {
        document: {
          ingredients: [
            "2 cups flour",
            "1 cup Flour",
            "Sauce:",
            "Salt to taste",
          ],
        },
      },
    ]),
    ["Flour", "Salt to taste"],
  );
});
