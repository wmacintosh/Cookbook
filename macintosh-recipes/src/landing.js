import { inject } from "@vercel/analytics";

// Keep previously shared recipe and invitation links working.
const url = new URL(location.href);
const recipeLink = [
  "recipe",
  "q",
  "category",
  "contributor",
  "status",
  "tab",
].some((key) => url.searchParams.has(key));
if (recipeLink || new URLSearchParams(url.hash.slice(1)).has("invite")) {
  url.pathname = "/recipes.html";
  location.replace(url.href);
} else {
  inject();
}
