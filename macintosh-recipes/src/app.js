import { auditRecipes } from "./recipe-quality.js";
import {
  measurementUnits,
  parseIngredient,
  ingredientLine,
  ingredientSuggestions,
} from "./ingredients.js";
import {
  filterRecipes,
  readRoute,
  routeURL,
  reviewComparison,
} from "./collection.js";
import { inject } from "@vercel/analytics";
import { createClient } from "@supabase/supabase-js";
const URL = "https://ybvirernmgqbwomanfqc.supabase.co",
  KEY = "sb_publishable_Ik1iq-hC8ym8NXav-8Cw7g_gguIx9e_";
const db = createClient(URL, KEY, { auth: { detectSessionInUrl: false } });
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[m],
    );
let categories = [
  "All recipes",
  "Cookies & sweets",
  "Breads & muffins",
  "Main dishes",
  "Sides & salads",
  "Soups",
  "Other family recipes",
];
const cardPhotoCache = new Map();
const state = {
  recipes: [],
  contributors: [],
  members: [],
  sources: [],
  proposals: [],
  member: null,
  selected: null,
  category: "All recipes",
  tab: "recipe",
  editing: null,
  loading: false,
};
let editorBaseline = "",
  editorBusy = false,
  photoPreviewURL = null;
let collectionSignature = "",
  detailSignature = "",
  cooking = false;
const cookingProgress = new Map();
const inviteToken = new URLSearchParams(location.hash.slice(1)).get("invite");
inject({
  mode: "production",
  beforeSend: (event) => {
    const url = new globalThis.URL(event.url);
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  },
});
if (inviteToken) {
  history.replaceState(null, "", location.pathname);
  $("#authTitle").textContent = "Join the family collection";
  $("#authHelp").textContent =
    "Use the email your invitation was created for and choose a password with at least 12 characters.";
  $("#authSubmit").textContent = "Create account";
  $("#inviteHelp").textContent =
    "Your invitation is private and can be used once.";
  $("#authForm").elements.password.autocomplete = "new-password";
}
const icon =
  '<svg viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M4 2h11l5 5v19H4zM15 2v6h5M8 13h8M8 17h8M8 21h5"/></svg>';
function check(r) {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
function notice(message) {
  $("#notice").textContent = message;
  $("#notice").classList.add("visible");
  clearTimeout(notice.timer);
  notice.timer = setTimeout(
    () => $("#notice").classList.remove("visible"),
    6500,
  );
}
function contributor(id) {
  return state.contributors.find((c) => c.id === id);
}
function badge(id) {
  const c = contributor(id);
  return c
    ? `<span class="person" style="--contributor:${esc(c.color)}"><span class="avatar">${esc(c.name[0].toUpperCase())}</span>${esc(c.name)}</span>`
    : '<span class="muted">Contributor unassigned</span>';
}
function category(r) {
  const c = r.document.category;
  if (c && c !== "Uncategorized") return c;
  const t = r.document.title.toLowerCase();
  if (/soup|chowder/.test(t)) return "Soups";
  if (/bread|muffin|bannock|bun|roll|loaf/.test(t)) return "Breads & muffins";
  if (
    /cookie|cake|square|brownie|pie|pudding|fudge|tart|dessert|frosting|ice cream|cheesecake|jam/.test(
      t,
    )
  )
    return "Cookies & sweets";
  if (
    /chicken|beef|pork|meat|ribs|steak|ham|turkey|fish|lobster|crab|casserole/.test(
      t,
    )
  )
    return "Main dishes";
  if (
    /salad|vegetable|rice|potato|bean|broccoli|cauliflower|cabbage|sauce|dip/.test(
      t,
    )
  )
    return "Sides & salads";
  return "Other family recipes";
}
const verified = (r) => r.document.status_review_flag === "verified";
async function api(action, args = {}) {
  const {
    data: { session },
  } = await db.auth.getSession();
  const response = await fetch(URL + "/functions/v1/family-recipes", {
    method: "POST",
    headers: {
      apikey: KEY,
      "Content-Type": "application/json",
      ...(session ? { Authorization: "Bearer " + session.access_token } : {}),
    },
    body: JSON.stringify({ action, ...args }),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The connection was interrupted. Please try again.");
  }
  if (!response.ok || data.error)
    throw new Error(data.error || "Could not save.");
  return data;
}
async function allRecipes() {
  let rows = [];
  for (let i = 0; ; i += 1000) {
    const batch = check(
      await db
        .from("recipes")
        .select("*")
        .order("id")
        .range(i, i + 999),
    );
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}
async function loadData(announce = false) {
  if (state.loading) return;
  state.loading = true;
  try {
    const {
      data: { session },
    } = await db.auth.getSession();
    if (!session) {
      state.member = null;
      collectionSignature = "";
      detailSignature = "";
      $("#manageMenu").hidden = true;
      $("#authView").hidden = false;
      $("#collection").hidden = true;
      for (const id of [
        "signOut",
        "addButton",
        "familyButton",
        "reviewButton",
        "quickButton",
      ])
        $("#" + id).hidden = true;
      $("#identity").textContent = "";
      return;
    }
    const member = check(
      await db
        .from("members")
        .select("*")
        .eq("id", session.user.id)
        .eq("active", true)
        .single(),
    );
    state.member = member;
    const results = await Promise.all([
      allRecipes(),
      db.from("contributors").select("*").order("name"),
      db.from("source_files").select("*"),
      db
        .from("proposals")
        .select("*")
        .eq("status", "pending")
        .order("created_at"),
      db.from("members").select("*"),
      db.from("recipe_categories").select("name").order("name"),
    ]);
    state.recipes = results[0];
    state.contributors = check(results[1]);
    state.sources = check(results[2]);
    state.proposals = check(results[3]);
    state.members = check(results[4]);
    categories = [
      "All recipes",
      ...new Set([
        ...categories.slice(1),
        ...check(results[5]).map((c) => c.name),
        ...state.recipes.map(category),
      ]),
    ];
    $("#manageMenu").hidden = member.role !== "owner";
    $("#authView").hidden = true;
    $("#collection").hidden = false;
    $("#identity").textContent = member.display_name;
    $("#signOut").hidden = false;
    $("#addButton").hidden = false;
    $("#familyButton").hidden = member.role !== "owner";
    $("#quickButton").hidden = member.role !== "owner";
    $("#reviewButton").hidden = member.role !== "owner";
    $("#reviewButton").textContent =
      `Review submissions${state.proposals.length ? " (" + state.proposals.length + ")" : ""}`;
    const nextSignature = JSON.stringify([
      state.recipes,
      state.contributors,
      state.sources,
      categories,
      member.role,
    ]);
    if (nextSignature === collectionSignature) {
      if (announce) notice("You have the latest recipes.");
      return;
    }
    collectionSignature = nextSignature;
    const current =
      $("#contributorFilter").value || readRoute(location.href).contributor;
    $("#contributorFilter").innerHTML =
      '<option value="">All contributors</option><option value="unassigned">Unassigned</option>' +
      state.contributors
        .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
        .join("");
    $("#contributorFilter").value = current;
    if (!state.selected || !state.recipes.some((r) => r.id === state.selected))
      state.selected =
        state.recipes.find((r) => r.document.ingredients?.length)?.id ||
        state.recipes[0]?.id;
    const shown = filteredRecipes();
    if (!shown.some((r) => r.id === state.selected))
      state.selected = shown[0]?.id || null;
    renderList();
    const selected = state.recipes.find((r) => r.id === state.selected);
    const nextDetail = JSON.stringify([
      selected,
      state.contributors,
      state.sources,
      state.tab,
    ]);
    if (nextDetail !== detailSignature) {
      await renderDetail();
    }
    if (announce) notice("The latest saved recipes are loaded.");
  } catch (e) {
    notice(e.message);
    $("#authError").textContent = e.message;
    $("#signOut").hidden = false;
  } finally {
    state.loading = false;
  }
}
function filteredRecipes() {
  return filterRecipes(
    state.recipes,
    {
      query: $("#search").value,
      contributor: $("#contributorFilter").value,
      status: $("#statusFilter").value,
      category: state.category,
    },
    state.contributors,
    category,
  );
}
function renderList() {
  const rows = filteredRecipes();
  $("#categories").innerHTML = categories
    .map(
      (c) =>
        `<button class="${state.category === c ? "active" : ""}" aria-pressed="${state.category === c}" data-category="${esc(c)}">${esc(c)}</button>`,
    )
    .join("");
  $("#categories")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          state.category = b.dataset.category;
          filtersChanged();
        }),
    );
  $("#recipeCount").textContent =
    rows.length + (rows.length === 1 ? " recipe" : " recipes");
  $("#clearFilters").hidden = !(
    $("#search").value ||
    $("#contributorFilter").value ||
    $("#statusFilter").value ||
    state.category !== "All recipes"
  );
  const listScroll = $("#recipeList").scrollTop;
  $("#recipeList").innerHTML = rows.length
    ? rows
        .map(
          (r) =>
            `<button class="recipe-item ${r.id === state.selected ? "active" : ""}" data-id="${esc(r.id)}" style="--contributor:${esc(contributor(r.contributor_id)?.color || "#b0bcc6")}" ${r.id === state.selected ? 'aria-current="true"' : ""}><span class="document-tile" data-photo-id="${esc(r.id)}">${icon}<span>${r.document.media?.length ? "Card ref." : "Recipe"}</span></span><span><h3>${esc(r.document.title)}${r.document.version ? " · " + esc(r.document.version) : ""}</h3><span class="meta"><span class="tag">${esc(category(r))}</span>${badge(r.contributor_id)}</span></span></button>`,
        )
        .join("")
    : '<p class="empty-state">No recipes match. Try a different search or filter.</p>';
  $("#recipeList").scrollTop = listScroll;
  loadCardPhotos();
  $("#recipeList")
    .querySelectorAll("button")
    .forEach((b) => (b.onclick = () => openRecipe(b.dataset.id)));
}
let renderSequence = 0;
async function renderDetail() {
  const sequence = ++renderSequence;
  const r = state.recipes.find((x) => x.id === state.selected);
  detailSignature = JSON.stringify([
    r,
    state.contributors,
    state.sources,
    state.tab,
  ]);
  if (!r) {
    $("#recipePanel").innerHTML =
      `<p class="empty-state">${state.recipes.length ? "No matching recipes. Clear your filters to explore the collection." : "No recipes yet. Add the first family recipe."}</p>`;
    return;
  }
  const d = r.document;
  $("#recipePanel").innerHTML =
    `<button class="back-button quiet" id="backToRecipes">Back to recipes</button><div class="detail-top"><div><h1 tabindex="-1" id="recipeHeading">${esc(d.title)}</h1><div class="byline">${badge(r.contributor_id)}<span class="tag">${esc(category(r))}</span></div></div><div class="actions"><button class="quiet" id="editRecipe">Edit recipe</button><button class="quiet" id="shareRecipe">Copy link</button>${state.member.role === "owner" ? '<details class="recipe-options"><summary>More</summary><button class="quiet danger" id="deleteRecipe">Delete recipe</button></details>' : ""}</div></div>${d.attribution ? `<p class="muted">Original attribution: ${esc(d.attribution)}</p>` : ""}<div class="tabs" role="tablist" aria-label="Recipe view"><button id="recipeTab" role="tab" aria-controls="detailContent" tabindex="${state.tab === "recipe" ? 0 : -1}" aria-selected="${state.tab === "recipe"}" class="${state.tab === "recipe" ? "active" : ""}">Recipe</button><button id="scanTab" role="tab" aria-controls="detailContent" tabindex="${state.tab === "scan" ? 0 : -1}" aria-selected="${state.tab === "scan"}" class="${state.tab === "scan" ? "active" : ""}">Original scan</button></div><section id="detailContent" class="content" role="tabpanel" aria-labelledby="${state.tab === "recipe" ? "recipeTab" : "scanTab"}" tabindex="0"></section>`;
  $("#backToRecipes").onclick = backToRecipes;
  $("#shareRecipe").onclick = copyRecipeLink;
  $("#editRecipe").onclick = () => openEditor(r);
  if ($("#deleteRecipe"))
    $("#deleteRecipe").onclick = async () => {
      if (
        !confirm(
          "Delete “" +
            d.title +
            "” from the family collection? Its original source and edit history will be retained.",
        )
      )
        return;
      const b = $("#deleteRecipe");
      b.disabled = true;
      try {
        await api("delete", { id: r.id, version: r.version });
        state.selected = null;
        await loadData();
        notice("Recipe deleted from the family collection.");
      } catch (e) {
        notice(e.message);
        b.disabled = false;
      }
    };
  $("#recipeTab").onclick = () => setTab("recipe");
  $("#scanTab").onclick = () => setTab("scan");
  $(".tabs").onkeydown = (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    setTab(
      e.key === "Home"
        ? "recipe"
        : e.key === "End"
          ? "scan"
          : state.tab === "recipe"
            ? "scan"
            : "recipe",
    );
  };
  if (state.tab === "scan") {
    await renderScans(r, sequence);
    return;
  }
  $("#detailContent").innerHTML =
    `${!verified(r) ? '<div class="review-note">This recipe still needs comparison with its original source. Missing or unclear details have been left as recorded.</div>' : ""}${d.ingredients?.length ? "<h3>Ingredients</h3><ul>" + d.ingredients.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : '<h3>Ingredients</h3><p class="muted">Not transcribed in the recovered record.</p>'}${d.instructions?.length ? "<h3>Directions</h3><ol>" + d.instructions.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol>" : '<h3>Directions</h3><p class="muted">No directions were recorded in this transcription.</p>'}${d.notes ? "<h3>Notes</h3><p>" + esc(d.notes).replace(/\n/g, "<br>") + "</p>" : ""}<div class="source-detail"><p>${d.submitted_by ? "Added by " + esc(d.submitted_by) + " · " : ""}Version ${r.version} · ${new Date(r.updated_at).toLocaleDateString()}</p></div><button id="printRecipe" class="quiet">Print recipe</button>`;
  $("#printRecipe").onclick = () => window.print();
  installCooking(r);
}
async function renderScans(r, sequence) {
  const media = (r.document.media || []).filter(
      (m) => m.type === "original_handwritten_card_scan",
    ),
    available = [];
  for (const m of media) {
    const registry = state.sources.find((x) => x.name === m.file);
    if (m.path || registry)
      available.push({ ...m, path: m.path || registry.path });
  }
  if (!available.length) {
    $("#detailContent").innerHTML =
      `<div class="empty-scan"><h3>Original scan not attached yet</h3>${media.length ? media.map((m) => "<p>" + esc(m.file) + (m.pages ? " · pages " + esc(m.pages) : "") + "</p>").join("") : "<p>No original card was included with this recipe.</p>"}<p class="muted">${state.member.role === "owner" ? "Upload the original PDFs in “Family & sources”, or attach a scan when editing this recipe." : "An original scan can be attached when you propose a recipe edit."}</p></div>`;
    return;
  }
  $("#detailContent").innerHTML =
    '<p class="loading">Opening the original…</p>';
  const panels = [];
  for (const m of available) {
    try {
      const link = check(
        await db.storage.from("recipe-media").createSignedUrl(m.path, 600),
      );
      const page = String(m.pages || "1").match(/\d+/)?.[0] || "1";
      const pdf =
        m.mime === "application/pdf" || m.path.toLowerCase().endsWith(".pdf");
      panels.push(
        `<p class="muted">${esc(m.file || m.name || "Original recipe card")}${m.pages ? " · pages " + esc(m.pages) : ""}</p>${pdf ? `<iframe class="scan-frame" title="Original recipe scan" src="${esc(link.signedUrl)}#page=${page}"></iframe>` : `<img class="scan-image" alt="Original scan of ${esc(r.document.title)}" src="${esc(link.signedUrl)}">`}<div class="scan-actions"><a href="${esc(link.signedUrl)}${pdf ? "#page=" + page : ""}" target="_blank" rel="noopener noreferrer">Open original in a new tab</a></div>`,
      );
    } catch (e) {
      panels.push('<p class="error">' + esc(e.message) + "</p>");
    }
  }
  if (sequence === renderSequence)
    $("#detailContent").innerHTML = panels.join("");
}
let ingredientRows = [];
let ingredientTextMode = false;
function syncIngredients() {
  $("#editorForm").elements.ingredients.value = ingredientRows
    .map(ingredientLine)
    .filter((line) => line.trim())
    .join("\n");
}
function renderIngredients(focusIndex = null) {
  $("#ingredientRows").innerHTML = ingredientRows
    .map((row, i) => {
      const units = [...new Set([...measurementUnits, row.unit])];
      return `<div class="ingredient-entry" data-ingredient="${i}">
      <label>Quantity<input data-part="quantity" aria-label="Quantity ${i + 1}" placeholder="e.g. 1 ½" value="${esc(row.quantity)}"></label>
      <label>Measurement<select data-part="unit" aria-label="Measurement ${i + 1}">${units.map((u) => `<option value="${esc(u)}" ${u === row.unit ? "selected" : ""}>${esc(u || "No unit")}</option>`).join("")}</select></label>
      <label>Ingredient<input data-part="ingredient" aria-label="Ingredient ${i + 1}" list="ingredientSuggestions" autocomplete="off" placeholder="Search or type an ingredient" value="${esc(row.ingredient)}"></label>
      <button type="button" class="quiet" data-remove-ingredient="${i}" aria-label="Remove ingredient ${i + 1}">×</button>
    </div>`;
    })
    .join("");
  if (focusIndex !== null)
    $("#ingredientRows")
      .querySelector(`[data-ingredient="${focusIndex}"] input`)
      ?.focus();
}
function setIngredientMode(textMode) {
  ingredientTextMode = textMode;
  $("#ingredientRows").hidden = textMode;
  $("#addIngredient").hidden = textMode;
  $("#ingredientTextLabel").hidden = !textMode;
  $("#ingredientMode").textContent = textMode
    ? "Use ingredient rows"
    : "Paste or edit as text";
}
function loadIngredientRows() {
  const text = $("#editorForm").elements.ingredients.value;
  ingredientRows = text
    ? text.split("\n").map(parseIngredient)
    : [parseIngredient("")];
  renderIngredients();
}
$("#ingredientRows").oninput = (e) => {
  const el = e.target.closest("[data-ingredient]");
  if (!el || !e.target.dataset.part || editorBusy) return;
  ingredientRows[Number(el.dataset.ingredient)][e.target.dataset.part] =
    e.target.value;
  syncIngredients();
};
$("#ingredientRows").onclick = (e) => {
  const button = e.target.closest("[data-remove-ingredient]");
  if (!button || editorBusy) return;
  const index = Number(button.dataset.removeIngredient);
  ingredientRows.splice(index, 1);
  syncIngredients();
  renderIngredients(Math.min(index, ingredientRows.length - 1));
  if (!ingredientRows.length) $("#addIngredient").focus();
};
$("#addIngredient").onclick = () => {
  ingredientRows.push(parseIngredient(""));
  renderIngredients(ingredientRows.length - 1);
};
$("#ingredientMode").onclick = () => {
  if (ingredientTextMode) loadIngredientRows();
  setIngredientMode(!ingredientTextMode);
};
function openEditor(r = null) {
  state.editing = r;
  const f = $("#editorForm");
  f.reset();
  $("#saveMessage").textContent = "";
  $("#editorTitle").textContent = r
    ? "Edit family recipe"
    : "Add a family recipe";
  const owner = state.member.role === "owner";
  $("#editorHelp").textContent = owner
    ? "Save corrections for everyone. The original import and prior versions are preserved."
    : "Your recipe or edits go to Wade for review before appearing for everyone.";
  $("#verifiedLabel").hidden = !owner;
  $("#saveButton").textContent = owner
    ? "Save for everyone"
    : "Submit for review";
  $("#editCategory").innerHTML = categories
    .slice(1)
    .map((c) => `<option>${esc(c)}</option>`)
    .join("");
  $("#editContributor").innerHTML =
    '<option value="">Unassigned</option>' +
    state.contributors
      .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
      .join("");
  $("#editContributor").disabled = !owner;
  if (r) {
    for (const name of ["title", "attribution", "notes"])
      f.elements[name].value = r.document[name] || "";
    f.elements.ingredients.value = (r.document.ingredients || []).join("\n");
    f.elements.instructions.value = (r.document.instructions || []).join("\n");
    f.elements.category.value = category(r);
    f.elements.contributor_id.value = r.contributor_id || "";
    f.elements.mark_verified.checked = verified(r);
  } else {
    f.elements.contributor_id.value = state.member.contributor_id;
    f.elements.category.value = "Other family recipes";
  }
  loadIngredientRows();
  setIngredientMode(false);
  $("#ingredientSuggestions").innerHTML = ingredientSuggestions(state.recipes)
    .map((name) => `<option value="${esc(name)}"></option>`)
    .join("");
  const photos = (r?.document.media || []).filter(
    (m) => m.type === "recipe_photo" && m.path && m.mime?.startsWith("image/"),
  );
  $("#cardPhotoSelect").innerHTML =
    '<option value="">No card photo</option>' +
    photos
      .map(
        (m) =>
          `<option value="${esc(m.path)}">${esc(m.name || "Recipe photo")}</option>`,
      )
      .join("");
  $("#cardPhotoSelect").value = r?.document.card_photo_path || "";
  editorBaseline = editorSnapshot();
  $("#saveProgress").textContent = "";
  clearPhotoPreview();
  $("#editorDialog").showModal();
}
async function upload(file, type) {
  if (!file?.size) return null;
  if (file.size > 20971520)
    throw new Error("Each attachment must be 20 MB or smaller.");
  const extension = file.name
    .split(".")
    .pop()
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  const path = state.member.id + "/" + crypto.randomUUID() + "." + extension;
  check(
    await db.storage
      .from("recipe-media")
      .upload(path, file, { contentType: file.type, upsert: false }),
  );
  return { type, path, name: file.name, mime: file.type };
}
$("#editorForm").onsubmit = async (e) => {
  e.preventDefault();
  const button = $("#saveButton");
  button.disabled = true;
  editorBusy = true;
  $("#editorDialog").setAttribute("aria-busy", "true");
  $("#saveProgress").textContent = "Preparing your recipe…";
  $("#saveMessage").textContent = "";
  const controls = [...e.target.elements].map((el) => [el, el.disabled]);
  try {
    const f = e.target;
    controls.forEach(([el]) => (el.disabled = true));
    const added_media = [];
    for (const [name, type] of [
      ["scan", "original_handwritten_card_scan"],
      ["photo", "recipe_photo"],
    ]) {
      if (f.elements[name].files[0])
        $("#saveProgress").textContent =
          "Uploading " +
          (name === "scan" ? "original scan" : "recipe photo") +
          "…";
      const m = await upload(f.elements[name].files[0], type);
      if (m) added_media.push(m);
    }
    const split = (n) =>
      f.elements[n].value
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
    $("#saveProgress").textContent = "Saving your recipe…";
    const result = await api("save", {
      id: state.editing?.id,
      version: state.editing?.version,
      document: {
        title: f.elements.title.value,
        category: f.elements.category.value,
        attribution: f.elements.attribution.value,
        ingredients: split("ingredients"),
        instructions: split("instructions"),
        notes: f.elements.notes.value,
        card_photo_path:
          added_media.find((m) => m.type === "recipe_photo")?.path ||
          f.elements.card_photo_path.value,
        added_media,
      },
      contributor_id: f.elements.contributor_id.value,
      mark_verified: f.elements.mark_verified.checked,
      change_note: f.elements.change_note.value,
    });
    if (!result.pending) state.selected = result.recipe_id;
    editorBaseline = editorSnapshot();
    $("#editorDialog").close();
    await loadData();
    notice(
      result.pending
        ? "Submitted to Wade for review."
        : "Saved online for the whole family.",
    );
  } catch (e) {
    $("#saveMessage").textContent = e.message;
  } finally {
    controls.forEach(([el, disabled]) => (el.disabled = disabled));
    editorBusy = false;
    $("#editorDialog").removeAttribute("aria-busy");
    $("#saveProgress").textContent = "";
    button.disabled = false;
  }
};
$("#authForm").onsubmit = async (e) => {
  e.preventDefault();
  const b = $("#authSubmit");
  b.disabled = true;
  $("#authError").textContent = "";
  try {
    const f = e.target;
    let email = f.elements.email.value.trim();
    if (inviteToken) {
      const r = await api("register", {
        token: inviteToken,
        email,
        password: f.elements.password.value,
      });
      email = r.email;
    }
    check(
      await db.auth.signInWithPassword({
        email,
        password: f.elements.password.value,
      }),
    );
    await loadData();
  } catch (e) {
    $("#authError").textContent = e.message;
  } finally {
    b.disabled = false;
  }
};
$("#signOut").onclick = async () => {
  await db.auth.signOut();
  state.recipes = [];
  cardPhotoCache.clear();
  state.member = null;
  await loadData();
};
$("#addButton").onclick = () => openEditor();
$("#search").oninput = filtersChanged;
$("#contributorFilter").onchange = filtersChanged;
$("#statusFilter").onchange = filtersChanged;
$("#clearFilters").onclick = () => {
  $("#search").value = "";
  $("#contributorFilter").value = "";
  $("#statusFilter").value = "";
  state.category = "All recipes";
  filtersChanged();
};
$("#refresh").onclick = () => loadData(true);
document
  .querySelectorAll("dialog .close")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
function familyContents() {
  $("#categoryList").textContent = categories.slice(1).join(" · ");
  $("#contributorList").innerHTML = state.contributors
    .map((c) => '<div class="name-row">' + badge(c.id) + "</div>")
    .join("");
  $("#sourceList").innerHTML = state.sources.length
    ? state.sources
        .map((s) => "<p>" + esc(s.name) + " — connected</p>")
        .join("")
    : '<p class="muted">No source PDFs attached yet.</p>';
}
$("#familyButton").onclick = () => {
  familyContents();
  $("#familyDialog").showModal();
};
$("#inviteForm").onsubmit = async (e) => {
  e.preventDefault();
  const b = e.target.querySelector("button");
  b.disabled = true;
  try {
    const f = new FormData(e.target),
      r = await api("invite", { name: f.get("name"), email: f.get("email") });
    const link = location.origin + "/#invite=" + r.token;
    $("#inviteResult").innerHTML =
      "<p>Share this private, single-use link with " +
      esc(f.get("name")) +
      '. It expires in 7 days.</p><input id="createdInvite" readonly aria-label="Family invitation link"><button id="copyInvite" class="quiet">Copy invitation</button>';
    $("#createdInvite").value = link;
    $("#copyInvite").onclick = async () => {
      try {
        await navigator.clipboard.writeText(link);
        notice("Invitation copied.");
      } catch {
        $("#createdInvite").select();
        notice("Select and copy the invitation link.");
      }
    };
    e.target.reset();
  } catch (e) {
    notice(e.message);
  } finally {
    b.disabled = false;
  }
};
$("#contributorForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const f = new FormData(e.target);
    await api("contributor", { name: f.get("name"), color: f.get("color") });
    await loadData();
    familyContents();
    e.target.reset();
    notice("Contributor added with a permanent color.");
  } catch (e) {
    notice(e.message);
  }
};
$("#sourceUpload").onchange = async (e) => {
  e.target.disabled = true;
  try {
    for (const file of e.target.files) {
      if (file.size > 20971520)
        throw new Error("Each PDF must be 20 MB or smaller.");
      if (file.type !== "application/pdf") throw new Error("Choose a PDF.");
      const path = "sources/" + crypto.randomUUID() + ".pdf";
      check(
        await db.storage
          .from("recipe-media")
          .upload(path, file, { contentType: "application/pdf" }),
      );
      await api("source", { name: file.name, path });
    }
    await loadData();
    familyContents();
    notice("Original source files connected.");
  } catch (e) {
    notice(e.message);
  } finally {
    e.target.disabled = false;
    e.target.value = "";
  }
};
$("#exportButton").onclick = () => {
  const data = {
    exported_at: new Date().toISOString(),
    recipes: state.recipes,
    contributors: state.contributors,
    source_files: state.sources,
  };
  const url = window.URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "macintosh-family-recipes-backup.json";
  a.click();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};
function renderReview() {
  $("#reviewList").innerHTML = state.proposals.length
    ? state.proposals
        .map(
          (p) =>
            `<section class="review-card"><span class="tag">${p.base_version ? "Proposed edit" : "New recipe"}</span><h3>${esc(p.document.title)}</h3><p class="muted">Submitted by ${esc(state.members.find((m) => m.id === p.submitted_by)?.display_name || "Family member")}</p>${p.document.attribution ? "<p>Original attribution: " + esc(p.document.attribution) + "</p>" : ""}<details><summary>Read proposed recipe</summary><h3>Ingredients</h3><pre>${esc((p.document.ingredients || []).join("\n"))}</pre><h3>Directions</h3><pre>${esc((p.document.instructions || []).join("\n"))}</pre>${p.document.notes ? "<p>" + esc(p.document.notes) + "</p>" : ""}</details>${reviewComparison(
              p,
              state.recipes.find((r) => r.id === p.recipe_id),
              state.contributors,
            )}<div id="review-media-${esc(p.id)}"></div><label>Review note<input id="note-${esc(p.id)}" placeholder="Optional note"></label><div class="actions"><button data-review="${esc(p.id)}" data-accept="true">Approve</button><button class="quiet" data-review="${esc(p.id)}" data-accept="false">Reject</button></div></section>`,
        )
        .join("")
    : '<p class="empty-state">No submissions waiting for review.</p>';
  for (const p of state.proposals) {
    for (const m of p.document.media || []) {
      if (m.path) {
        db.storage
          .from("recipe-media")
          .createSignedUrl(m.path, 600)
          .then((r) => {
            if (r.data) {
              const a = document.createElement("a");
              a.href = r.data.signedUrl;
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              a.textContent =
                "Review attachment: " + (m.name || m.file || "Original scan");
              const item = document.createElement("p");
              item.append(a);
              $("#review-media-" + p.id)?.append(item);
            }
          });
      }
    }
  }
  $("#reviewList")
    .querySelectorAll("[data-review]")
    .forEach(
      (b) =>
        (b.onclick = async () => {
          const buttons = b
            .closest(".review-card")
            .querySelectorAll("[data-review]");
          buttons.forEach((x) => (x.disabled = true));
          try {
            await api("review", {
              id: b.dataset.review,
              accept: b.dataset.accept === "true",
              note: $("#note-" + b.dataset.review).value,
            });
            await loadData();
            renderReview();
            notice(
              b.dataset.accept === "true"
                ? "Approved and saved for everyone."
                : "Submission rejected.",
            );
          } catch (e) {
            notice(e.message);
          } finally {
            buttons.forEach((x) => (x.disabled = false));
          }
        }),
    );
}
$("#reviewButton").onclick = () => {
  renderReview();
  $("#reviewDialog").showModal();
};

const quickFields = [
  "title",
  "category",
  "attribution",
  "contributor_id",
  "ingredients",
  "instructions",
  "notes",
];
let quickQuality = new Map();
let quickRows = [],
  quickBusy = false;
const quickValue = (r, k) =>
  k === "contributor_id"
    ? r.contributor_id || ""
    : Array.isArray(r.document[k])
      ? r.document[k].join("\n")
      : r.document[k] || "";
function quickOptions(type, value) {
  return type === "category"
    ? categories
        .slice(1)
        .map(
          (c) => `<option ${c === value ? "selected" : ""}>${esc(c)}</option>`,
        )
        .join("")
    : '<option value="">Unassigned</option>' +
        state.contributors
          .map(
            (c) =>
              `<option value="${esc(c.id)}" ${c.id === value ? "selected" : ""}>${esc(c.name)}</option>`,
          )
          .join("");
}
function quickDirty(row) {
  return quickFields.some((k) => row.values[k] !== row.original[k]);
}
function quickVisible() {
  const q = $("#quickSearch").value.trim().toLowerCase();
  return quickRows.filter(
    (row) =>
      ($("#quickView").value !== "missing" ||
        quickQuality.get(row.id)?.missing) &&
      ($("#quickView").value !== "empty" || quickQuality.get(row.id)?.empty) &&
      ($("#quickView").value !== "duplicates" ||
        quickQuality.get(row.id)?.duplicates.length) &&
      [row.values.title, row.values.ingredients, row.values.attribution]
        .join(" ")
        .toLowerCase()
        .includes(q) &&
      (!$("#quickCategory").value ||
        row.values.category === $("#quickCategory").value) &&
      ($("#quickContributor").value === "all" ||
        row.values.contributor_id === $("#quickContributor").value) &&
      ($("#quickView").value !== "changed" || quickDirty(row)) &&
      ($("#quickView").value !== "selected" || row.selected),
  );
}
function quickStatus() {
  const n = quickRows.filter(quickDirty).length;
  const selected = quickRows.filter((r) => r.selected).length;
  $("#quickDialog").classList.toggle("has-selection", selected > 0);
  const shownIds = [...$("#quickTable").querySelectorAll("[data-row]")].map(
    (el) => el.dataset.row,
  );
  const shown = quickRows.filter((r) => shownIds.includes(r.id));
  const checked = shown.filter((r) => r.selected).length;
  $("#quickStatus").textContent = n
    ? `${n} recipe${n === 1 ? "" : "s"} with unsaved changes`
    : "All changes saved";
  $("#quickSave").textContent = n
    ? `Save ${n} recipe${n === 1 ? "" : "s"}`
    : "Save changes";
  $("#quickSave").disabled = quickBusy || !n;
  $("#quickUndo").disabled = quickBusy || !n;
  $("#quickSelection").textContent =
    `${selected} selected${selected > checked ? ` · ${selected - checked} outside this view` : ""}`;
  $("#quickCount").textContent =
    `${shown.length} of ${quickRows.length} recipes`;
  $("#quickSelectAll").checked = !!shown.length && checked === shown.length;
  $("#quickSelectAll").indeterminate = checked > 0 && checked < shown.length;
  $("#quickSelectAll").disabled = quickBusy || !shown.length;
  $("#quickClearSelection").disabled = quickBusy || !selected;
  $("#quickDelete").disabled = quickBusy || !selected;
  $("#quickDelete").textContent = selected
    ? `Delete selected (${selected})`
    : "Delete selected";
  $("#applyBulk").disabled =
    quickBusy ||
    !selected ||
    (!$("#bulkCategory").value && $("#bulkContributor").value === "keep");
}
function quickField(row, key, label, multiline = false) {
  const col = quickFields.indexOf(key);
  const attrs = `data-col="${col}" aria-label="${esc(label)}"`;
  return `<label>${label}${
    ["category", "contributor_id"].includes(key)
      ? `<select ${attrs}>${quickOptions(key, row.values[key])}</select>`
      : multiline
        ? `<textarea ${attrs} rows="5">${esc(row.values[key])}</textarea>`
        : `<input ${attrs} value="${esc(row.values[key])}">`
  }</label>`;
}
function renderQuick() {
  quickQuality = auditRecipes(
    quickRows.map((row) => ({
      id: row.id,
      document: {
        ...row.values,
        ingredients: row.values.ingredients.split("\n"),
        instructions: row.values.instructions.split("\n"),
      },
    })),
  );
  $("#quickTable").innerHTML =
    quickVisible()
      .map(
        (row) => `
    <article data-row="${esc(row.id)}" class="quick-row ${quickDirty(row) ? "dirty" : ""}">
      <div class="quick-row-main">
        <input class="quick-check" type="checkbox" aria-label="Select ${esc(row.values.title)}" ${row.selected ? "checked" : ""}>
        ${quickField(row, "title", "Title")}${quickField(row, "category", "Category")}${quickField(row, "contributor_id", "Contributor")}
        <button class="quiet quick-revert" ${quickDirty(row) ? "" : "disabled"}>Undo</button>
      </div>
      <details ${row.expanded ? "open" : ""}><summary>Recipe text <span class="quick-row-status">${row.error ? "Needs attention" : quickDirty(row) ? "Unsaved" : ""}</span></summary>
        <div class="quick-text-fields">${quickField(row, "ingredients", "Ingredients", true)}${quickField(row, "instructions", "Directions", true)}${quickField(row, "notes", "Notes", true)}${quickField(row, "attribution", "Original attribution")}</div>
        <p class="muted">Use one ingredient or direction per line.</p>
      </details>
      ${quickQuality.get(row.id)?.reasons.length ? `<p class="quick-quality-note">${esc(quickQuality.get(row.id).reasons.join(" "))}</p>` : ""}
      <p class="quick-row-error" ${row.error ? "" : "hidden"}>${esc(row.error || "")}</p>
    </article>`,
      )
      .join("") ||
    '<div class="quick-empty">No recipes match these filters. Change your search or filters to see more.</div>';
  $("#quickTable")
    .querySelectorAll("details")
    .forEach(
      (el) =>
        (el.ontoggle = () => {
          const row = quickRows.find(
            (r) => r.id === el.closest("[data-row]").dataset.row,
          );
          row.expanded = el.open;
        }),
    );
  quickStatus();
}
$("#quickTable").oninput = (e) => {
  if (quickBusy) return;
  const el = e.target.closest("[data-row]");
  if (!el) return;
  const row = quickRows.find((r) => r.id === el.dataset.row);
  if (e.target.type === "checkbox") row.selected = e.target.checked;
  else if (e.target.dataset.col !== undefined) {
    row.values[quickFields[Number(e.target.dataset.col)]] = e.target.value;
    el.classList.toggle("dirty", quickDirty(row));
    el.querySelector(".quick-revert").disabled = !quickDirty(row);
    el.querySelector(".quick-row-status").textContent = row.error
      ? "Needs attention"
      : quickDirty(row)
        ? "Unsaved"
        : "";
  }
  $("#quickMessage").textContent = "";
  quickStatus();
};
$("#quickTable").onclick = (e) => {
  if (!e.target.closest(".quick-revert") || quickBusy) return;
  const row = quickRows.find(
    (r) => r.id === e.target.closest("[data-row]").dataset.row,
  );
  row.values = { ...row.original };
  row.error = "";
  renderQuick();
};
$("#quickSelectAll").onchange = (e) => {
  $("#quickTable")
    .querySelectorAll("[data-row]")
    .forEach((el) => {
      quickRows.find((r) => r.id === el.dataset.row).selected =
        e.target.checked;
      el.querySelector(".quick-check").checked = e.target.checked;
    });
  quickStatus();
};
$("#quickClearSelection").onclick = () => {
  quickRows.forEach((row) => (row.selected = false));
  renderQuick();
};
$("#quickDelete").onclick = async () => {
  if (quickBusy || state.member?.role !== "owner") return;
  const selected = quickRows.filter((row) => row.selected);
  if (!selected.length) return;
  const names = selected.map((row) => "• " + row.original.title).join("\n");
  if (
    !confirm(
      `Delete ${selected.length} selected recipe${selected.length === 1 ? "" : "s"} from the family collection, including any selected outside this view?\n\n${names}\n\nUnsaved edits to these recipes will be discarded. Original sources and edit history will be retained.`,
    )
  )
    return;
  quickBusy = true;
  $("#quickDialog")
    .querySelectorAll("input,textarea,select,button")
    .forEach((el) => (el.disabled = true));
  let deleted = 0,
    failed = 0;
  for (const row of selected) {
    $("#quickStatus").textContent =
      `Deleting ${deleted + failed + 1} of ${selected.length}…`;
    try {
      await api("delete", { id: row.id, version: row.version });
      quickRows = quickRows.filter((r) => r.id !== row.id);
      state.recipes = state.recipes.filter((r) => r.id !== row.id);
      if (state.selected === row.id) state.selected = null;
      deleted++;
    } catch (error) {
      row.error = "Could not delete: " + error.message;
      failed++;
    }
  }
  let refreshMessage = "";
  try {
    await loadData();
  } catch {
    refreshMessage = " Refresh the collection later to check its latest state.";
  }
  quickBusy = false;
  $("#quickDialog")
    .querySelectorAll("input,textarea,select,button")
    .forEach((el) => (el.disabled = false));
  renderQuick();
  $("#quickMessage").textContent =
    `${deleted} recipe${deleted === 1 ? "" : "s"} deleted.` +
    (failed
      ? ` ${failed} could not be deleted and remain selected. Your other edits have been kept.`
      : " Your other edits have been kept.") +
    refreshMessage;
};
$("#quickUndo").onclick = () => {
  if (!confirm("Discard all unsaved recipe changes?")) return;
  quickRows.forEach((row) => {
    row.values = { ...row.original };
    row.error = "";
  });
  $("#quickMessage").textContent = "Changes discarded.";
  renderQuick();
};
for (const id of ["quickCategory", "quickContributor", "quickView"])
  $("#" + id).onchange = renderQuick;
for (const id of ["bulkCategory", "bulkContributor"])
  $("#" + id).onchange = quickStatus;
$("#quickTable").onpaste = (e) => {
  const cell = e.target.closest("[data-col]"),
    tr = e.target.closest("[data-row]");
  if (!cell || !tr) return;
  const text = e.clipboardData.getData("text/plain");
  if (quickBusy || cell.tagName === "TEXTAREA" || !text.includes("\t")) return;
  const visible = [...$("#quickTable").querySelectorAll("[data-row]")].map(
    (el) => quickRows.find((r) => r.id === el.dataset.row),
  );
  const start = visible.findIndex((r) => r.id === tr.dataset.row),
    col = ["title", "category", "contributor_id"].indexOf(
      quickFields[Number(cell.dataset.col)],
    );
  if (col < 0) return;
  e.preventDefault();
  text
    .replace(/\r/g, "")
    .replace(/\n$/, "")
    .split("\n")
    .forEach((line, i) => {
      const row = visible[start + i];
      if (!row) return;
      line.split("\t").forEach((v, j) => {
        const k = ["title", "category", "contributor_id"][col + j];
        if (!k) return;
        if (k === "contributor_id") {
          const c = state.contributors.find(
            (c) => c.id === v || c.name.toLowerCase() === v.toLowerCase(),
          );
          if (v && !c) return;
          v = c?.id || "";
        }
        if (k === "category" && !categories.slice(1).includes(v)) return;
        row.values[k] = v;
      });
    });
  renderQuick();
};
$("#quickSearch").oninput = renderQuick;
$("#applyBulk").onclick = () => {
  if (quickBusy) return;
  for (const row of quickRows.filter((r) => r.selected)) {
    if ($("#bulkCategory").value)
      row.values.category = $("#bulkCategory").value;
    if ($("#bulkContributor").value !== "keep")
      row.values.contributor_id = $("#bulkContributor").value;
  }
  renderQuick();
};
$("#quickButton").onclick = () => {
  quickRows = state.recipes.map((r) => {
    const values = Object.fromEntries(
      quickFields.map((k) => [k, quickValue(r, k)]),
    );
    values.category = category(r);
    return {
      id: r.id,
      version: r.version,
      document: r.document,
      original: { ...values },
      values,
      selected: false,
    };
  });
  $("#quickSearch").value = "";
  $("#quickCategory").innerHTML =
    '<option value="">All categories</option>' + quickOptions("category", "");
  $("#quickContributor").innerHTML =
    '<option value="all">All contributors</option>' +
    quickOptions("contributor_id", "");
  $("#quickView").value = "all";
  $("#quickMessage").textContent = "";
  $("#bulkCategory").innerHTML =
    '<option value="">Keep category</option>' + quickOptions("category", "");
  $("#bulkContributor").innerHTML =
    '<option value="keep">Keep contributor</option>' +
    quickOptions("contributor_id", "");
  renderQuick();
  $("#quickDialog").showModal();
};
$("#quickDialog").addEventListener("cancel", (e) => {
  if (
    quickBusy ||
    (quickRows.some(quickDirty) && !confirm("Discard unsaved recipe changes?"))
  )
    e.preventDefault();
});
$("#quickDialog .close").onclick = () => {
  if (
    !quickBusy &&
    (!quickRows.some(quickDirty) || confirm("Discard unsaved recipe changes?"))
  )
    $("#quickDialog").close();
};
$("#quickSave").onclick = async () => {
  const changed = quickRows.filter(quickDirty);
  if (!changed.length) return;
  const invalid = changed.find((row) => !row.values.title.trim());
  if (invalid) {
    invalid.error = "Add a title before saving.";
    $("#quickMessage").textContent =
      "Every recipe needs a title. Your changes have been kept.";
    renderQuick();
    return;
  }
  quickBusy = true;
  $("#quickDialog")
    .querySelectorAll("input,textarea,select,button")
    .forEach((e) => (e.disabled = true));
  let saved = 0,
    failures = [];
  for (const row of changed) {
    $("#quickStatus").textContent =
      `Saving ${saved + failures.length + 1} of ${changed.length}…`;
    try {
      const v = row.values;
      await api("save", {
        id: row.id,
        version: row.version,
        document: {
          ...row.document,
          ...v,
          ingredients: v.ingredients
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
          instructions: v.instructions
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
        },
        contributor_id: v.contributor_id,
        change_note: "Admin quick edit",
      });
      row.original = { ...v };
      row.error = "";
      row.version++;
      saved++;
    } catch (e) {
      row.error = e.message;
      failures.push(row.values.title + ": " + e.message);
    }
  }
  let refreshError = "";
  try {
    await loadData();
  } catch {
    refreshError =
      " The collection could not refresh. You can close and refresh later.";
  }
  quickBusy = false;
  $("#quickDialog")
    .querySelectorAll("input,textarea,select,button")
    .forEach((e) => (e.disabled = false));
  renderQuick();
  $("#quickMessage").textContent =
    `${saved} recipe${saved === 1 ? "" : "s"} saved for everyone.` +
    (failures.length
      ? ` ${failures.length} could not save. Your edits are kept; see the message on each recipe.`
      : "") +
    refreshError;
};

$("#categoryForm").onsubmit = async (e) => {
  e.preventDefault();
  const b = e.target.querySelector("button");
  b.disabled = true;
  try {
    await api("category", { name: e.target.elements.name.value });
    await loadData();
    familyContents();
    e.target.reset();
    notice("Category added for everyone.");
  } catch (e) {
    notice(e.message);
  } finally {
    b.disabled = false;
  }
};
async function loadCardPhotos() {
  for (const tile of $("#recipeList").querySelectorAll("[data-photo-id]")) {
    const r = state.recipes.find((r) => r.id === tile.dataset.photoId),
      path = r?.document.card_photo_path;
    if (!path) continue;
    try {
      let cached = cardPhotoCache.get(path);
      if (!cached || cached.expires < Date.now()) {
        const result = check(
          await db.storage.from("recipe-media").createSignedUrl(path, 600),
        );
        cached = { url: result.signedUrl, expires: Date.now() + 540000 };
        cardPhotoCache.set(path, cached);
      }
      if (!tile.isConnected) continue;
      const img = document.createElement("img");
      img.src = cached.url;
      img.alt = "Photo of " + r.document.title;
      img.loading = "lazy";
      img.onerror = () => {
        img.remove();
        tile.classList.remove("has-photo");
        tile.innerHTML = icon;
      };
      tile.replaceChildren(img);
      tile.classList.add("has-photo");
    } catch {
      /* Retain default recipe tile if the photo is unavailable. */
    }
  }
}

function editorSnapshot() {
  return JSON.stringify(
    [...$("#editorForm").elements]
      .filter((el) => el.name)
      .map((el) => [
        el.name,
        el.type === "file"
          ? [...el.files].map((f) => [f.name, f.size, f.lastModified])
          : el.type === "checkbox"
            ? el.checked
            : el.value,
      ]),
  );
}
function editorDirty() {
  return $("#editorDialog").open && editorSnapshot() !== editorBaseline;
}
function closeEditor() {
  if (editorBusy) return;
  if (editorDirty() && !confirm("Discard your unsaved recipe changes?")) return;
  $("#editorDialog").close();
}
$("#editorDialog .close").onclick = closeEditor;
$("#cancelEditor").onclick = closeEditor;
$("#editorDialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeEditor();
});
$("#editorDialog").addEventListener("close", clearPhotoPreview);
window.addEventListener("beforeunload", (e) => {
  if (
    editorBusy ||
    editorDirty() ||
    quickBusy ||
    ($("#quickDialog").open && quickRows.some(quickDirty))
  ) {
    e.preventDefault();
    e.returnValue = "";
  }
});
function clearPhotoPreview() {
  if (photoPreviewURL) globalThis.URL.revokeObjectURL(photoPreviewURL);
  photoPreviewURL = null;
  $("#photoPreview").hidden = true;
  $("#photoPreview").removeAttribute("src");
}
$("#editorForm").elements.photo.addEventListener("change", (e) => {
  clearPhotoPreview();
  const file = e.target.files[0];
  if (file && file.type.startsWith("image/")) {
    photoPreviewURL = globalThis.URL.createObjectURL(file);
    $("#photoPreview").src = photoPreviewURL;
    $("#photoPreview").hidden = false;
  }
});

function currentRoute() {
  return {
    query: $("#search").value,
    category: state.category,
    contributor: $("#contributorFilter").value,
    status: $("#statusFilter").value,
    recipe: $(".workspace").classList.contains("detail-open")
      ? state.selected
      : null,
    tab: state.tab,
  };
}
function writeRoute(push = false) {
  history[push ? "pushState" : "replaceState"](
    { ...history.state, recipe: currentRoute().recipe },
    "",
    routeURL(location.href, currentRoute()),
  );
}
function stopCooking() {
  cooking = false;
  $("#recipePanel").classList.remove("cooking");
}
function filtersChanged() {
  stopCooking();
  $(".workspace").classList.remove("detail-open");
  state.tab = "recipe";
  const rows = filteredRecipes();
  if (!rows.some((r) => r.id === state.selected))
    state.selected = rows[0]?.id || null;
  renderList();
  renderDetail();
  writeRoute();
}
async function openRecipe(id) {
  history.replaceState(
    {
      ...history.state,
      listScroll: $("#recipeList").scrollTop,
      pageScroll: scrollY,
      returnFocus: id,
    },
    "",
  );
  stopCooking();
  state.selected = id;
  state.tab = "recipe";
  $(".workspace").classList.add("detail-open");
  writeRoute(true);
  history.replaceState({ ...history.state, detailEntry: true }, "");
  renderList();
  await renderDetail();
  $("#recipeHeading")?.focus({ preventScroll: true });
  if (matchMedia("(max-width:680px)").matches)
    $("#recipePanel").scrollIntoView({ block: "start" });
}
function backToRecipes() {
  if (history.state?.detailEntry) {
    history.back();
    return;
  }
  stopCooking();
  $(".workspace").classList.remove("detail-open");
  writeRoute();
  restoreListPosition();
}
function restoreListPosition() {
  const entry = history.state || {};
  $("#recipeList").scrollTop = entry.listScroll || 0;
  window.scrollTo(0, entry.pageScroll || 0);
  [...$("#recipeList").querySelectorAll("[data-id]")]
    .find((b) => b.dataset.id === (entry.returnFocus || state.selected))
    ?.focus({ preventScroll: true });
}
function restoreRoute() {
  const route = readRoute(location.href);
  $("#search").value = route.query;
  $("#contributorFilter").value = route.contributor;
  $("#statusFilter").value = route.status;
  state.category = route.category;
  state.selected = route.recipe;
  state.tab = route.tab;
  $(".workspace").classList.toggle("detail-open", Boolean(route.recipe));
}
window.addEventListener("popstate", async () => {
  stopCooking();
  restoreRoute();
  const rows = filteredRecipes();
  if (!rows.some((r) => r.id === state.selected))
    state.selected = rows[0]?.id || null;
  renderList();
  await renderDetail();
  if (!currentRoute().recipe) restoreListPosition();
});
async function setTab(tab) {
  state.tab = tab;
  stopCooking();
  writeRoute();
  await renderDetail();
  $("#" + tab + "Tab")?.focus();
}
async function copyRecipeLink() {
  const link = routeURL(location.href, {
    recipe: state.selected,
    tab: state.tab,
  });
  try {
    await navigator.clipboard.writeText(link);
    notice("Recipe link copied. Family members will need to sign in.");
  } catch {
    prompt("Copy this recipe link:", link);
  }
}
function installCooking(r) {
  const content = $("#detailContent");
  const toolbar = document.createElement("div");
  toolbar.className = "cooking-toolbar";
  toolbar.innerHTML =
    '<button id="cookingToggle" class="quiet" aria-pressed="false">Cooking mode</button><span class="muted">A little more room to follow along.</span>';
  content.prepend(toolbar);
  const progress = cookingProgress.get(r.id) || { checked: new Set(), step: 0 };
  cookingProgress.set(r.id, progress);
  const apply = () => {
    $("#recipePanel").classList.toggle("cooking", cooking);
    $("#cookingToggle").setAttribute("aria-pressed", String(cooking));
    $("#cookingToggle").textContent = cooking
      ? "Exit cooking mode"
      : "Cooking mode";
    content
      .querySelectorAll(".ingredient-check")
      .forEach((el) => (el.hidden = !cooking));
    content
      .querySelectorAll(".step-select")
      .forEach((el) => (el.hidden = !cooking));
    content.querySelectorAll("ol > li").forEach((el, i) => {
      el.classList.toggle("current-step", cooking && progress.step === i);
      el.querySelector("button")?.setAttribute(
        "aria-pressed",
        String(progress.step === i),
      );
    });
  };
  content.querySelectorAll("ul > li").forEach((li, i) => {
    const text = li.textContent;
    li.textContent = "";
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "ingredient-check";
    box.checked = progress.checked.has(i);
    box.onchange = () => {
      box.checked ? progress.checked.add(i) : progress.checked.delete(i);
      label.classList.toggle("completed", box.checked);
    };
    label.classList.toggle("completed", box.checked);
    label.append(box, document.createTextNode(text));
    li.append(label);
  });
  content.querySelectorAll("ol > li").forEach((li, i) => {
    const b = document.createElement("button");
    b.className = "step-select quiet";
    b.textContent = "Step " + (i + 1);
    b.setAttribute("aria-label", "Mark step " + (i + 1) + " as current");
    b.onclick = () => {
      progress.step = i;
      apply();
    };
    li.prepend(b);
  });
  $("#cookingToggle").onclick = () => {
    cooking = !cooking;
    apply();
  };
  apply();
}
$("#categoryToggle").onclick = () => {
  const expanded =
    $("#categoryToggle").getAttribute("aria-expanded") !== "true";
  $("#categoryToggle").setAttribute("aria-expanded", String(expanded));
  $("#categoryToggle").textContent = expanded
    ? "Fewer categories"
    : "All categories";
  $("#categories").classList.toggle("expanded", expanded);
};
$("#manageMenu")
  .querySelectorAll("button")
  .forEach((b) =>
    b.addEventListener("click", () => ($("#manageMenu").open = false)),
  );
restoreRoute();
db.auth.onAuthStateChange(() => setTimeout(() => loadData(), 0));
await loadData();
setInterval(() => {
  if (
    !document.hidden &&
    state.member &&
    !cooking &&
    !document.querySelector("dialog[open]")
  )
    loadData();
}, 20000);
