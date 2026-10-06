// Collection filtering, URLs, and readable submission comparisons.
export function filterRecipes(recipes, filters, contributors, categoryOf) {
  const query = (filters.query || "").trim().toLowerCase();
  return recipes
    .filter((recipe) => {
      const d = recipe.document;
      const author =
        contributors.find((c) => c.id === recipe.contributor_id)?.name || "";
      const text = [
        d.title,
        d.alternate_title,
        d.attribution,
        author,
        ...(d.ingredients || []),
        ...(d.instructions || []),
        ...(d.searchable_tags || []),
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!query || text.includes(query)) &&
        (!filters.contributor ||
          (filters.contributor === "unassigned"
            ? !recipe.contributor_id
            : recipe.contributor_id === filters.contributor)) &&
        (!filters.category ||
          filters.category === "All recipes" ||
          categoryOf(recipe) === filters.category) &&
        (!filters.status ||
          (filters.status === "verified"
            ? d.status_review_flag === "verified"
            : d.status_review_flag !== "verified"))
      );
    })
    .sort((a, b) => a.document.title.localeCompare(b.document.title));
}

export function readRoute(href) {
  const p = new URL(href).searchParams;
  return {
    query: p.get("q") || "",
    category: p.get("category") || "All recipes",
    contributor: p.get("contributor") || "",
    status: ["review", "verified"].includes(p.get("status"))
      ? p.get("status")
      : "",
    recipe: p.get("recipe"),
    tab: p.get("tab") === "scan" ? "scan" : "recipe",
  };
}

export function routeURL(href, route) {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  for (const [key, value] of Object.entries({
    q: route.query,
    category: route.category === "All recipes" ? "" : route.category,
    contributor: route.contributor,
    status: route.status,
    recipe: route.recipe,
    tab: route.tab === "scan" ? "scan" : "",
  })) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const display = (value) =>
  escapeHTML(Array.isArray(value) ? value.join("\n") : value || "Not provided");
export function reviewComparison(proposal, recipe, contributors) {
  const current = recipe?.document || {};
  const proposed = proposal.document || {};
  const rows = [
    ["title", "Title"],
    ["category", "Category"],
    ["attribution", "Original attribution"],
    ["ingredients", "Ingredients"],
    ["instructions", "Directions"],
    ["notes", "Notes"],
    ["card_photo_path", "Card photo"],
  ].map(([field, label]) => {
    const after = Object.hasOwn(proposed, field)
      ? proposed[field]
      : current[field];
    return { label, before: current[field], after };
  });
  if (Object.hasOwn(proposal, "contributor_id")) {
    const name = (id) =>
      contributors.find((c) => c.id === id)?.name || "Unassigned";
    rows.push({
      label: "Contributor",
      before: name(recipe?.contributor_id),
      after: name(proposal.contributor_id),
    });
  }
  return (
    '<details class="review-comparison" open><summary>' +
    (recipe ? "Review changes" : "Review recipe details") +
    "</summary>" +
    rows
      .sort(
        (a, b) =>
          Number(
            JSON.stringify(b.before ?? "") !== JSON.stringify(b.after ?? ""),
          ) -
          Number(
            JSON.stringify(a.before ?? "") !== JSON.stringify(a.after ?? ""),
          ),
      )
      .map(({ label, before, after }) => {
        const changed =
          JSON.stringify(before ?? "") !== JSON.stringify(after ?? "");
        return `<section class="comparison-field ${changed ? "changed" : ""}"><h4>${label}${changed ? ' <span class="change-label">Changed</span>' : ""}</h4><div class="comparison-values">${recipe ? `<div><strong>Current</strong><p>${label === "Card photo" ? (before ? "Selected recipe photo" : "No card photo") : display(before)}</p></div>` : ""}<div><strong>Proposed</strong><p>${label === "Card photo" ? (after ? "Selected recipe photo" : "No card photo") : display(after)}</p></div></div></section>`;
      })
      .join("") +
    "</details>"
  );
}
