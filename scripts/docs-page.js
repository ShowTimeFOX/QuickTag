// Docs page (pages/docs.html): left sidebar + one section at a time.
// Content is data in docs/sections.js; docs/render.js builds the DOM.
// Address: docs.html#<section> or docs.html#<section>/<question> (opens
// that Troubleshooting question). Unknown addresses show the first section.
import { DOCS_SECTIONS, RELEASES } from "./docs/sections.js";
import { el, inline, renderBlocks, strokeIcon } from "./docs/render.js";

const nav = document.getElementById("docs-nav");
const content = document.getElementById("docs-content");
const versionLabel = document.getElementById("docs-version");

function parseHash() {
  const [sectionId = "", itemId = ""] = decodeURIComponent(location.hash.slice(1)).split("/");
  const section = DOCS_SECTIONS.find((entry) => entry.id === sectionId) || DOCS_SECTIONS[0];
  return { section, itemId: section.id === sectionId ? itemId : "" };
}

function renderNav() {
  nav.replaceChildren(
    el(
      "ul",
      { className: "docs-nav-list" },
      DOCS_SECTIONS.map((section) =>
        el("li", {}, [
          el("a", { className: "docs-nav-link", attrs: { href: `#${section.id}`, "data-section": section.id } }, [strokeIcon(section.icon), el("span", { text: section.title })]),
        ]),
      ),
    ),
  );
}

function pagerLink(section, direction) {
  if (!section) return el("span");
  return el("a", { className: `docs-pager-link docs-pager-${direction}`, attrs: { href: `#${section.id}` } }, [
    el("span", { className: "docs-pager-hint", text: direction === "prev" ? "Previous" : "Next" }),
    el("span", { className: "docs-pager-title", text: section.title }),
  ]);
}

/** Narrow screens show the sidebar as a scrolling row: keep the active item in view. */
function revealActiveNavItem() {
  const list = nav.querySelector(".docs-nav-list");
  const active = nav.querySelector(".docs-nav-link.active");
  if (!list || !active || list.scrollWidth <= list.clientWidth) return;
  list.scrollLeft += active.getBoundingClientRect().left - list.getBoundingClientRect().left - 16;
}

function render({ section, itemId }) {
  const index = DOCS_SECTIONS.indexOf(section);
  content.replaceChildren(
    el("article", { className: "docs-section", attrs: { id: `section-${section.id}`, "data-section": section.id } }, [
      el("header", { className: "docs-section-head" }, [el("h1", { text: section.title }), el("p", { className: "docs-lead" }, inline(section.summary))]),
      ...renderBlocks(section.blocks, section.id, RELEASES),
      el("nav", { className: "docs-pager", attrs: { "aria-label": "Previous and next section" } }, [pagerLink(DOCS_SECTIONS[index - 1], "prev"), pagerLink(DOCS_SECTIONS[index + 1], "next")]),
    ]),
  );
  nav.querySelectorAll(".docs-nav-link").forEach((linkEl) => {
    const active = linkEl.dataset.section === section.id;
    linkEl.classList.toggle("active", active);
    if (active) linkEl.setAttribute("aria-current", "page");
    else linkEl.removeAttribute("aria-current");
  });
  revealActiveNavItem();
  document.title = `${section.title} — QuickTag Docs`;

  const item = itemId ? document.getElementById(`${section.id}-${itemId}`) : null;
  if (item) {
    item.open = true;
    item.scrollIntoView({ block: "start" });
  } else {
    window.scrollTo(0, 0);
  }
}

function showVersion() {
  try {
    versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;
  } catch {
    versionLabel.hidden = true;
  }
}

renderNav();
showVersion();
render(parseHash());
window.addEventListener("hashchange", () => render(parseHash()));
