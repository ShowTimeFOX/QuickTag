// Tagger palette checks shared by chrome.mjs and firefox.mjs: group order kept
// after a reload (Chrome's storage sorts object keys), the AI button and AI
// group, "+ All", Flat view labels, and the palette using the window height.
import { sleep } from "./pages.mjs";
import { ROOT, READY, waitFor } from "./checks.mjs";

const ORDER_PACK = { name: "Order Pack", groups: { Zeta: { c: ["z_c"], a: ["z_a"], b: ["z_b"] }, Alpha: { m: ["a_m"] }, Mid: { x: ["m_x"] } } };

const SHOW_TAGGING = `(() => {
  const root = ${ROOT};
  if (root.querySelector("#lazymod-window").hidden) root.querySelector("#lm-show-tagger").click();
  root.querySelector("#lm-tab-btn-main").click();
  return true;
})()`;
const IMPORT_ORDER_PACK = `(() => {
  const input = ${ROOT}.querySelector("#lm-pack-file");
  const transfer = new DataTransfer();
  transfer.items.add(new File([${JSON.stringify(JSON.stringify(ORDER_PACK))}], "order.json", { type: "application/json" }));
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`;
const PALETTE = `(() => {
  const root = ${ROOT};
  const tabs = [...root.querySelectorAll("#lm-palette-tabs .lazymod-tab")];
  const chips = root.querySelector("#lm-user-chips");
  const button = root.querySelector("#lm-fetch-ai");
  const all = root.querySelector("#lm-add-all-palette");
  return {
    pack: root.querySelector("#lm-pack-current").textContent,
    groups: tabs.map((tab) => tab.textContent),
    activeGroup: tabs.find((tab) => tab.classList.contains("active"))?.textContent || "",
    aiTabState: root.querySelector("#lm-palette-tabs .lazymod-ai-tab")?.dataset.state || "",
    categories: [...root.querySelectorAll("#lm-category-tabs .lazymod-subtab")].map((tab) => tab.textContent),
    labels: [...chips.querySelectorAll(".lazymod-chip-group-label")].map((label) => label.textContent),
    chipTags: [...chips.querySelectorAll(".lazymod-chip")].map((chip) => chip.dataset.tag),
    aiMessage: chips.querySelector(".lazymod-ai-message")?.textContent || "",
    aiMessageState: chips.querySelector(".lazymod-ai-message")?.dataset.state || "",
    aiBusy: button.getAttribute("aria-busy") === "true",
    aiLabel: button.textContent.trim(),
    allLabel: all.textContent.trim(),
    allDisabled: all.disabled,
    hasAiSection: Boolean(root.querySelector("#lm-ai-chips, #lm-ai-status")),
    chipsHeight: Math.round(chips.getBoundingClientRect().height),
    sectionBottomGap: Math.round(root.querySelector(".lazymod-palette-section").getBoundingClientRect().bottom - chips.getBoundingClientRect().bottom),
    // Unused space below the footer inside the tagger body (0 when the palette fills it).
    bodyGap: (() => { const body = root.querySelector("#lazymod-body"); return Math.round(body.getBoundingClientRect().bottom - root.querySelector(".lazymod-footer-actions").getBoundingClientRect().bottom); })(),
    bodyScrolls: (() => { const body = root.querySelector("#lazymod-body"); return body.scrollHeight > body.clientHeight + 1; })(),
  };
})()`;
const clickGroup = (name) => `(() => { [...${ROOT}.querySelectorAll("#lm-palette-tabs .lazymod-tab")].find((tab) => tab.textContent === ${JSON.stringify(name)}).click(); return true; })()`;

export async function runPaletteChecks({ open, evaluate, check, origin }) {
  // Group and category order survive storage (Chrome returns keys sorted).
  const page = await open(`${origin}/plain`);
  await waitFor(evaluate, page, READY, Boolean, 10000);
  await evaluate(page, SHOW_TAGGING);
  await evaluate(page, IMPORT_ORDER_PACK);
  const imported = await waitFor(evaluate, page, PALETTE, (state) => state.pack === "Order Pack");
  const reloaded = await open(`${origin}/plain`);
  await waitFor(evaluate, reloaded, READY, Boolean, 10000);
  await evaluate(reloaded, SHOW_TAGGING);
  const after = await waitFor(evaluate, reloaded, PALETTE, (state) => state.pack === "Order Pack");
  check(
    "Palette order: groups and categories keep their order after a reload (not alphabetical)",
    imported.groups.join() === "Zeta,Alpha,Mid" && imported.categories.join() === "c,a,b" && after.groups.join() === "Zeta,Alpha,Mid" && after.categories.join() === "c,a,b",
    { imported: [imported.groups, imported.categories], afterReload: [after.groups, after.categories] },
  );

  // Flat view: every category of the group under its label; "+ All" acts on what is visible.
  await evaluate(reloaded, `(() => { ${ROOT}.querySelector("#lm-flat-view").click(); return true; })()`);
  const flat = await evaluate(reloaded, PALETTE);
  await evaluate(reloaded, `(() => { ${ROOT}.querySelector("#lm-flat-view").click(); return true; })()`);
  check(
    'Palette: Flat view shows category labels with every tag of the group; the toggle reads "+ All"',
    flat.labels.join() === "c,a,b" && flat.chipTags.join() === "z_c,z_a,z_b" && flat.categories.length === 0 && flat.allLabel === "All" && !flat.hasAiSection,
    flat,
  );

  // AI: loading on the button, then the AI group first with the result state (ComfyUI is offline).
  const busy = await evaluate(reloaded, `(() => { ${ROOT}.querySelector("#lm-fetch-ai").click(); return ${PALETTE}; })()`);
  const aiDone = await waitFor(evaluate, reloaded, PALETTE, (state) => state.aiMessageState === "error" && !state.aiBusy, 20000);
  check(
    'Palette: the AI button shows loading; the "AI" group comes first with a Suggestions category and the error state',
    busy.aiBusy && busy.aiLabel === "AI…" && busy.aiMessageState === "busy" && aiDone.groups[0] === "AI" && aiDone.activeGroup === "AI" && aiDone.aiTabState === "error" && aiDone.categories.join() === "Suggestions" && /Could not connect to ComfyUI/.test(aiDone.aiMessage) && aiDone.aiLabel === "AI" && aiDone.allDisabled,
    { busy, aiDone },
  );
  await evaluate(reloaded, clickGroup("Alpha"));
  const backToGroup = await evaluate(reloaded, PALETTE);
  check("Palette: choosing a pack group leaves the AI group (still listed first)", backToGroup.activeGroup === "Alpha" && backToGroup.groups[0] === "AI" && backToGroup.chipTags.join() === "a_m" && !backToGroup.allDisabled, backToGroup);

  // The palette takes the free height of a tall tagger window.
  await evaluate(reloaded, `(() => { const win = ${ROOT}.querySelector("#lazymod-window"); win.style.height = Math.min(innerHeight - 40, 760) + "px"; return true; })()`);
  await sleep(200);
  const tall = await evaluate(reloaded, PALETTE);
  check(
    "Palette: the chips use the free height of the Tagging tab (no unused space below the palette)",
    tall.chipsHeight >= 150 && tall.sectionBottomGap < 30 && (tall.bodyScrolls || tall.bodyGap < 30),
    { chipsHeight: tall.chipsHeight, sectionGap: tall.sectionBottomGap, bodyGap: tall.bodyGap, bodyScrolls: tall.bodyScrolls },
  );
}
