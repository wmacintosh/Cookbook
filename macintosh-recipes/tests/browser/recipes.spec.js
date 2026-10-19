import { test, expect } from "@playwright/test";
const project = "ybvirernmgqbwomanfqc";
const owner = {
  id: "owner",
  active: true,
  role: "owner",
  display_name: "Wade",
  contributor_id: "jean",
};
const initialRecipes = [
  {
    id: "bread",
    version: 1,
    updated_at: "2026-10-01",
    contributor_id: "jean",
    document: {
      title: "Family Bread",
      category: "Breads & muffins",
      ingredients: ["2 cups flour", "1 cup water"],
      instructions: ["Mix the ingredients.", "Bake until golden."],
      notes: "A family favourite.",
      status_review_flag: "verified",
      media: [
        {
          type: "original_handwritten_card_scan",
          path: "cards/bread.pdf",
          mime: "application/pdf",
          pages: "2",
        },
      ],
    },
  },
  {
    id: "soup",
    version: 1,
    updated_at: "2026-10-01",
    contributor_id: "jean",
    document: {
      title: "Carrot Soup",
      category: "Soups",
      ingredients: ["3 carrots"],
      instructions: ["Simmer until tender."],
    },
  },
];
async function setup(
  page,
  { failure = false, delay = 0, extraRecipes = [] } = {},
) {
  const recipes = structuredClone([...initialRecipes, ...extraRecipes]),
    requests = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ project, owner }) => {
      const session = {
        access_token: "test.access.token",
        refresh_token: "test-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: owner.id,
          email: "test@example.com",
          aud: "authenticated",
          app_metadata: {},
          user_metadata: {},
        },
      };
      localStorage.setItem(
        "sb-" + project + "-auth-token",
        JSON.stringify(session),
      );
    },
    { project, owner },
  );
  await page.route("https://**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== project + ".supabase.co") {
      await route.fulfill({ status: 200, body: "" });
      return;
    }
    const json = (data) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.split("/").pop();
      const tables = {
        recipes,
        contributors: [{ id: "jean", name: "Jean", color: "#7b3e98" }],
        members: route.request().headers().accept?.includes("vnd.pgrst.object")
          ? owner
          : [owner],
        source_files: [],
        recipe_categories: [{ name: "Soups" }],
        proposals: [
          {
            id: "proposal",
            recipe_id: "bread",
            base_version: 1,
            submitted_by: "owner",
            contributor_id: "jean",
            document: {
              ...initialRecipes[0].document,
              ingredients: ["3 cups flour", "1 cup water"],
            },
          },
        ],
      };
      await json(tables[table] ?? []);
      return;
    }
    if (url.pathname.startsWith("/storage/v1/object/sign/")) {
      await json({ signedURL: "/object/test-scan" });
      return;
    }
    if (url.pathname.includes("test-scan")) {
      await route.fulfill({
        contentType: "text/html",
        body: "<h1>Original card preview</h1>",
      });
      return;
    }
    if (url.pathname.includes("/functions/v1/")) {
      const payload = route.request().postDataJSON();
      requests.push(payload);
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (typeof failure === "function" ? failure(payload) : failure) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "This recipe changed. Reload and review your edits.",
          }),
        });
        return;
      }
      if (payload.action === "delete") {
        const index = recipes.findIndex((r) => r.id === payload.id);
        if (index >= 0) recipes.splice(index, 1);
        await json({});
        return;
      }
      if (payload.action === "save") {
        const r = recipes.find((r) => r.id === payload.id);
        if (r) {
          r.document = { ...r.document, ...payload.document };
          r.version++;
          r.contributor_id = payload.contributor_id;
        }
        await json({ recipe_id: payload.id || "new-recipe", pending: false });
        return;
      }
      await json({});
      return;
    }
    await json({ user: { id: "owner" } });
  });
  return { requests, errors };
}

test("desktop filtering, accessible tabs, cooking mode, and browser Back", async ({
  page,
}) => {
  const { errors } = await setup(page);
  await page.goto("/recipes.html");
  await expect(page.locator("#recipeCount")).toHaveText("2 recipes");
  await page.locator('[data-id="bread"]').click();
  await expect(page).toHaveURL(/recipe=bread/);
  await page.getByRole("button", { name: "Cooking mode", exact: true }).click();
  await page.locator(".ingredient-check").first().check();
  await page.getByRole("button", { name: "Mark step 2 as current" }).click();
  await expect(page.locator(".current-step")).toContainText("Bake");
  await page.getByRole("button", { name: "Exit cooking mode" }).click();
  await page.getByRole("tab", { name: "Recipe", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Original scan" })).toBeFocused();
  await expect(page.locator(".scan-frame")).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/recipe=/);
  await page.locator("#search").fill("no match");
  await expect(page.locator("#recipeCount")).toHaveText("0 recipes");
  await expect(page.locator("#recipePanel")).toContainText(
    "No matching recipes",
  );
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("#recipeCount")).toHaveText("2 recipes");
  expect(errors).toEqual([]);
});

test("unchanged polling preserves the scan iframe and keyboard focus", async ({
  page,
}) => {
  await setup(page);
  await page.clock.install();
  await page.goto("/recipes.html?recipe=bread&tab=scan");
  await expect(page.locator(".scan-frame")).toBeVisible();
  await page
    .locator(".scan-frame")
    .evaluate((el) => (el.dataset.preserved = "yes"));
  await page.getByRole("tab", { name: "Original scan" }).focus();
  await page.clock.fastForward(21000);
  await expect(page.locator(".scan-frame")).toHaveAttribute(
    "data-preserved",
    "yes",
  );
  await expect(page.getByRole("tab", { name: "Original scan" })).toBeFocused();
});

test("editor keeps drafts on cancel and errors, and blocks dismissal while saving", async ({
  page,
}) => {
  const { requests, errors } = await setup(page, { failure: true, delay: 300 });
  await page.goto("/recipes.html?recipe=bread");
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page.getByLabel("Recipe title", { exact: true }).fill("Changed bread");
  page.once("dialog", (d) => d.dismiss());
  await page.keyboard.press("Escape");
  await expect(page.locator("#editorDialog")).toBeVisible();
  await page.getByRole("button", { name: "Save for everyone" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#editorDialog")).toBeVisible();
  await expect(page.locator("#saveMessage")).toContainText(
    "This recipe changed",
  );
  await expect(page.getByLabel("Recipe title", { exact: true })).toHaveValue(
    "Changed bread",
  );
  expect(requests[0].document.ingredients).toEqual([
    "2 cups flour",
    "1 cup water",
  ]);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("#editorDialog")).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("saving updates the recipe; review shows labelled changes", async ({
  page,
}) => {
  const { requests, errors } = await setup(page);
  await page.goto("/recipes.html?recipe=bread");
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page
    .getByLabel("Recipe title", { exact: true })
    .fill("Jean’s Family Bread");
  await page.getByRole("button", { name: "Save for everyone" }).click();
  await expect(page.locator("#editorDialog")).not.toBeVisible();
  await expect(page.locator("#recipeHeading")).toHaveText(
    "Jean’s Family Bread",
  );
  expect(requests[0].version).toBe(1);
  await page.locator("#manageMenu summary").click();
  await page.locator("#reviewButton").click();
  await expect(page.locator(".comparison-field.changed")).toContainText([
    "Ingredients",
  ]);
  await expect(page.locator(".comparison-values").first()).toContainText(
    "Current",
  );
  await page.screenshot({
    path: "test-results/review-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("mobile filters return to results, Back restores a recipe button, layout fits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors } = await setup(page);
  await page.goto("/recipes.html");
  await page.locator('[data-id="bread"]').click();
  await expect(page.locator(".recipe-browser")).not.toBeVisible();
  await page.locator("#search").fill("carrot");
  await expect(page.locator(".recipe-browser")).toBeVisible();
  await expect(page.locator("#recipeCount")).toHaveText("1 recipe");
  await page.locator('[data-id="soup"]').click();
  await page.getByRole("button", { name: "Back to recipes" }).click();
  await expect(page.locator('[data-id="soup"]')).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-list.png",
    fullPage: true,
  });
  await page.locator('[data-id="soup"]').click();
  await page.screenshot({
    path: "test-results/mobile-detail.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("quick edit still saves multiline ingredients and owner tools remain reachable", async ({
  page,
}) => {
  const { requests, errors } = await setup(page);
  await page.goto("/recipes.html?recipe=bread");
  await page.screenshot({
    path: "test-results/desktop-recipe.png",
    fullPage: true,
  });
  await page.locator("#manageMenu summary").click();
  await page.locator("#quickButton").click();
  await page.locator('[data-row="bread"] summary').click();
  await page
    .locator('[data-row="bread"] textarea[data-col="4"]')
    .fill("3 cups flour\n1 cup water");
  await page.locator("#quickSave").click();
  await expect(page.locator("#quickMessage")).toContainText("1 recipe saved");
  expect(requests[0].document.ingredients).toEqual([
    "3 cups flour",
    "1 cup water",
  ]);
  await page.getByRole("button", { name: "Close quick editor" }).click();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page.locator('input[name="photo"]').setInputFiles({
    name: "card.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9uoAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.locator("#photoPreview")).toBeVisible();
  expect(errors).toEqual([]);
});

async function openQuick(page) {
  await page.goto("/recipes.html");
  await page.locator("#manageMenu summary").click();
  await page.locator("#quickButton").click();
}
test("bulk editing selects filtered rows, retains hidden drafts and saves only changes", async ({
  page,
}) => {
  const { requests, errors } = await setup(page);
  await openQuick(page);
  await page.locator("#quickCategory").selectOption("Soups");
  await page.locator("#quickSelectAll").check();
  await page.locator("#quickCategory").selectOption("");
  await expect(page.locator("#quickSelection")).toHaveText("1 selected");
  await page.locator("#bulkCategory").selectOption("Main dishes");
  await page.locator("#applyBulk").click();
  await expect(
    page.locator('[data-row="soup"] select[data-col="1"]'),
  ).toHaveValue("Main dishes");
  await expect(
    page.locator('[data-row="bread"] select[data-col="1"]'),
  ).toHaveValue("Breads & muffins");
  await page
    .locator('[data-row="bread"] input[data-col="0"]')
    .fill("Jean’s Bread");
  await page.locator("#quickSearch").fill("carrot");
  await expect(page.locator("#quickSave")).toHaveText("Save 2 recipes");
  await page.locator("#quickSearch").fill("");
  await page.screenshot({ path: "test-results/quick-desktop.png" });
  await page.locator("#quickSave").click();
  await expect(page.locator("#quickMessage")).toContainText("2 recipes saved");
  expect(requests.filter((r) => r.action === "save")).toHaveLength(2);
  expect(requests[0].document.media).toEqual(initialRecipes[0].document.media);
  expect(errors).toEqual([]);
});
test("failed batch keeps edits and supports undo without losing other rows", async ({
  page,
}) => {
  const { errors } = await setup(page, { failure: true, delay: 100 });
  await openQuick(page);
  await page.locator("#quickSelectAll").check();
  await page.locator("#bulkContributor").selectOption("");
  await page.locator("#applyBulk").click();
  await page.locator("#quickSave").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#quickDialog")).toBeVisible();
  await expect(page.locator("#quickMessage")).toContainText("2 could not save");
  await expect(page.locator(".quick-row-error").first()).toContainText(
    "This recipe changed",
  );
  await page.locator('[data-row="bread"] .quick-revert').click();
  await expect(page.locator("#quickSave")).toHaveText("Save 1 recipe");
  page.once("dialog", (d) => d.dismiss());
  await page.getByLabel("Close quick editor").click();
  await expect(page.locator("#quickDialog")).toBeVisible();
  expect(errors).toEqual([]);
});
test("quick editor fits mobile with reachable footer and expanded text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await openQuick(page);
  await page.locator('[data-row="bread"] summary').click();
  await page
    .locator('[data-row="bread"] textarea[data-col="4"]')
    .fill("4 cups flour");
  await expect(page.locator("#quickSave")).toBeInViewport();
  expect(
    await page
      .locator("#quickDialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/quick-mobile.png" });
});

test("ingredient rows offer measurements and searchable names without changing untouched lines", async ({
  page,
}) => {
  const { requests, errors } = await setup(page);
  await page.goto("/recipes.html?recipe=bread");
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await expect(page.getByLabel("Quantity 1", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("Measurement 1", { exact: true })).toHaveValue(
    "cups",
  );
  await expect(
    page.getByLabel("Ingredient 1", { exact: true }),
  ).toHaveAttribute("list", "ingredientSuggestions");
  expect(
    await page
      .locator("#ingredientSuggestions option")
      .evaluateAll((options) => options.map((o) => o.value)),
  ).toContain("flour");
  await page.getByLabel("Quantity 1", { exact: true }).fill("1 ½");
  await page.getByLabel("Measurement 1", { exact: true }).selectOption("tbsp");
  await page
    .getByLabel("Ingredient 1", { exact: true })
    .fill("chopped fresh rosemary");
  await page
    .getByRole("button", { name: "+ Add ingredient", exact: true })
    .click();
  await page.getByLabel("Ingredient 3", { exact: true }).fill("Salt to taste");
  await page.screenshot({ path: "test-results/ingredient-editor.png" });
  await page
    .getByRole("button", { name: "Save for everyone", exact: true })
    .click();
  await expect(page.locator("#editorDialog")).not.toBeVisible();
  expect(requests[0].document.ingredients).toEqual([
    "1 ½ tbsp chopped fresh rosemary",
    "1 cup water",
    "Salt to taste",
  ]);
  expect(errors).toEqual([]);
});
test("new recipe supports pasted ingredients, row removal and draft protection", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/recipes.html");
  await page.locator("#addButton").click();
  await page.locator("#ingredientMode").click();
  await page
    .locator('textarea[name="ingredients"]')
    .fill("Sauce:\n½ tsp. salt\n1–2 cans tomatoes");
  await page.locator("#ingredientMode").click();
  await expect(page.getByLabel("Ingredient 1", { exact: true })).toHaveValue(
    "Sauce:",
  );
  await expect(page.getByLabel("Quantity 2", { exact: true })).toHaveValue("½");
  await page.getByLabel("Remove ingredient 2", { exact: true }).click();
  await page.locator("#ingredientMode").click();
  await expect(page.locator('textarea[name="ingredients"]')).toHaveValue(
    "Sauce:\n1–2 cans tomatoes",
  );
  page.once("dialog", (d) => d.dismiss());
  await page.locator("#cancelEditor").click();
  await expect(page.locator("#editorDialog")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#ingredientMode").click();
  expect(
    await page
      .locator("#editorDialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});

test("partially saved batches retry only unsaved rows", async ({ page }) => {
  let failed = false;
  const { requests } = await setup(page, {
    failure: (payload) => {
      if (payload.id === "soup" && !failed) {
        failed = true;
        return true;
      }
      return false;
    },
  });
  await openQuick(page);
  await page.locator("#quickSelectAll").check();
  await page.locator("#bulkCategory").selectOption("Main dishes");
  await page.locator("#applyBulk").click();
  await page.locator("#quickSave").click();
  await expect(page.locator("#quickMessage")).toContainText("1 could not save");
  await expect(page.locator("#quickSave")).toHaveText("Save 1 recipe");
  await page.locator("#quickSave").click();
  await expect(page.locator("#quickMessage")).toHaveText(
    "1 recipe saved for everyone.",
  );
  expect(requests.filter((r) => r.id === "bread")).toHaveLength(1);
  expect(requests.filter((r) => r.id === "soup")).toHaveLength(2);
});
test("spreadsheet paste follows visible metadata column order", async ({
  page,
}) => {
  const { requests } = await setup(page);
  await openQuick(page);
  await page
    .locator('[data-row="bread"] input[data-col="0"]')
    .evaluate((el) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", "Updated Bread\tMain dishes\tJean");
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  await page.locator("#quickSave").click();
  await expect(page.locator("#quickMessage")).toContainText("1 recipe saved");
  expect(requests[0].document.title).toBe("Updated Bread");
  expect(requests[0].document.category).toBe("Main dishes");
  expect(requests[0].contributor_id).toBe("jean");
});

test("quick delete confirms selection and preserves edits to other recipes", async ({
  page,
}) => {
  const { requests } = await setup(page);
  await openQuick(page);
  await expect(page.locator("#quickDelete")).toBeDisabled();
  await page
    .locator('[data-row="bread"] input[data-col="0"]')
    .fill("Keep this draft");
  await page.locator('[data-row="soup"] .quick-check').check();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#quickDelete").click();
  expect(requests).toHaveLength(0);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Carrot Soup");
    expect(dialog.message()).not.toContain("Family Bread");
    await dialog.accept();
  });
  await page.locator("#quickDelete").click();
  await expect(page.locator("#quickMessage")).toContainText("1 recipe deleted");
  await expect(page.locator('[data-row="soup"]')).toHaveCount(0);
  await expect(
    page.locator('[data-row="bread"] input[data-col="0"]'),
  ).toHaveValue("Keep this draft");
  expect(requests[0]).toMatchObject({
    action: "delete",
    id: "soup",
    version: 1,
  });
});
test("partial delete keeps failures selected and retry excludes deleted rows", async ({
  page,
}) => {
  let failed = false;
  const { requests } = await setup(page, {
    failure: (payload) => {
      if (payload.action === "delete" && payload.id === "soup" && !failed) {
        failed = true;
        return true;
      }
      return false;
    },
  });
  await openQuick(page);
  await page.locator("#quickSelectAll").check();
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#quickDelete").click();
  await expect(page.locator("#quickMessage")).toContainText(
    "1 could not be deleted",
  );
  await expect(page.locator("#quickDelete")).toHaveText("Delete selected (1)");
  await page.locator("#quickDelete").click();
  await expect(page.locator("#quickCount")).toHaveText("0 of 0 recipes");
  expect(requests.filter((r) => r.id === "bread")).toHaveLength(1);
});

test("cleanup filters distinguish duplicate text and empty source records", async ({
  page,
}) => {
  await setup(page, {
    extraRecipes: [
      { ...structuredClone(initialRecipes[0]), id: "duplicate" },
      {
        id: "scan",
        version: 1,
        document: { title: "Original card", ingredients: [], instructions: [] },
      },
    ],
  });
  await openQuick(page);
  await page.locator("#quickView").selectOption("duplicates");
  await expect(page.locator("#quickCount")).toHaveText("2 of 4 recipes");
  await expect(page.locator(".quick-quality-note").first()).toContainText(
    "Compare attribution and sources",
  );
  await page.locator("#quickView").selectOption("empty");
  await expect(page.locator("#quickCount")).toHaveText("1 of 4 recipes");
  await expect(page.locator(".quick-quality-note")).toContainText(
    "No transcribed recipe text",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#quickSelectAll").check();
  await expect(page.locator("#quickDelete")).toBeInViewport();
  expect(
    await page
      .locator("#quickDialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/quick-cleanup-mobile.png" });
});
