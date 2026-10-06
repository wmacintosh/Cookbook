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
async function setup(page, { failure = false, delay = 0 } = {}) {
  const recipes = structuredClone(initialRecipes),
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
              ...recipes[0].document,
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
      if (failure) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "This recipe changed. Reload and review your edits.",
          }),
        });
        return;
      }
      if (payload.action === "save") {
        const r = recipes.find((r) => r.id === payload.id);
        if (r) {
          r.document = { ...r.document, ...payload.document };
          r.version++;
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
  await page.goto("/");
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
  await page.goto("/?recipe=bread&tab=scan");
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
  await page.goto("/?recipe=bread");
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
  await page.goto("/?recipe=bread");
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
  await page.goto("/");
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
  await page.goto("/?recipe=bread");
  await page.screenshot({
    path: "test-results/desktop-recipe.png",
    fullPage: true,
  });
  await page.locator("#manageMenu summary").click();
  await page.locator("#quickButton").click();
  await page
    .locator('tr[data-row="bread"] textarea[data-col="4"]')
    .fill("3 cups flour\n1 cup water");
  await page.locator("#quickSave").click();
  await expect(page.locator("#quickStatus")).toContainText("1 recipes saved");
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
