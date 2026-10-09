const lines = (value) =>
  Array.isArray(value) ? value.map(String).filter((x) => x.trim()) : [];
const normalized = (value, steps = false) =>
  lines(value).map((line) => {
    let text = line.normalize("NFKC").toLowerCase().trim();
    if (steps) text = text.replace(/^\d+[.)]\s*(?=[a-z(])/, "");
    return text.replace(/\s+/g, " ");
  });
export function auditRecipes(recipes) {
  const results = new Map(),
    groups = new Map();
  for (const recipe of recipes) {
    const d = recipe.document,
      ingredients = lines(d.ingredients),
      directions = lines(d.instructions);
    const placeholder =
      ingredients.length === 1 && /^coming soon\b/i.test(ingredients[0]);
    const empty = !ingredients.length && !directions.length;
    const missing = !ingredients.length || !directions.length || placeholder;
    const reasons = empty
      ? ["No transcribed recipe text; check the original scan."]
      : placeholder
        ? ["Placeholder: recipe details have not been added."]
        : [];
    if (!empty && !placeholder && !ingredients.length)
      reasons.push("Ingredients field is empty.");
    if (!empty && !placeholder && !directions.length)
      reasons.push(
        "Directions field is empty; steps may be mixed into the ingredients.",
      );
    results.set(recipe.id, {
      empty,
      missing,
      placeholder,
      duplicates: [],
      reasons,
    });
    if (ingredients.length && directions.length && !placeholder) {
      const key = JSON.stringify([
        normalized(ingredients),
        normalized(directions, true),
      ]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(recipe);
    }
  }
  for (const group of groups.values())
    if (group.length > 1)
      for (const recipe of group) {
        const result = results.get(recipe.id);
        result.duplicates = group
          .filter((other) => other.id !== recipe.id)
          .map((other) => other.id);
        result.reasons.push(
          "Matching ingredients and directions: " +
            group
              .filter((other) => other.id !== recipe.id)
              .map((other) => `${other.document.title} (${other.id})`)
              .join(", ") +
            ". Compare attribution and sources before deleting.",
        );
      }
  return results;
}
