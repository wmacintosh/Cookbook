// Keep unedited source lines verbatim; parse only recognizable quantities/units.
export const measurementUnits = [
  "",
  "cup",
  "cups",
  "tsp",
  "tbsp",
  "teaspoon",
  "teaspoons",
  "tablespoon",
  "tablespoons",
  "g",
  "kg",
  "ml",
  "mL",
  "L",
  "oz",
  "lb",
  "lbs",
  "ounce",
  "ounces",
  "pound",
  "pounds",
  "pinch",
  "pinches",
  "dash",
  "clove",
  "cloves",
  "can",
  "cans",
  "package",
  "packages",
  "slice",
  "slices",
];
const amountPattern =
  /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?[¼½¾⅓⅔⅛⅜⅝⅞]?|[¼½¾⅓⅔⅛⅜⅝⅞])(?=\s|$)\s*/;
export function parseIngredient(line = "") {
  const original = String(line);
  let rest = original.trim(),
    quantity = "",
    unit = "";
  const amount = rest.match(amountPattern);
  if (amount) {
    quantity = amount[1];
    rest = rest.slice(amount[0].length);
    const word = rest.match(/^([a-zA-Z]+\.?)(?:\s+|$)/);
    if (
      word &&
      measurementUnits.some(
        (u) => u.toLowerCase() === word[1].replace(/\.$/, "").toLowerCase(),
      )
    ) {
      unit = word[1];
      rest = rest.slice(word[0].length);
    }
  }
  const row = { quantity, unit, ingredient: rest, original };
  row.baseline = [quantity, unit, rest].join("\u0000");
  return row;
}
export function ingredientLine(row) {
  if ([row.quantity, row.unit, row.ingredient].join("\u0000") === row.baseline)
    return row.original;
  return [row.quantity.trim(), row.unit.trim(), row.ingredient.trim()]
    .filter(Boolean)
    .join(" ");
}
export function ingredientSuggestions(recipes) {
  const values = new Map();
  for (const recipe of recipes)
    for (const line of recipe.document.ingredients || []) {
      const name = parseIngredient(line).ingredient.trim();
      if (name && !name.endsWith(":")) values.set(name.toLowerCase(), name);
    }
  return [...values.values()].sort((a, b) => a.localeCompare(b));
}
