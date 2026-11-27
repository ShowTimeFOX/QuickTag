// About and Docs page checks, shared by chrome.mjs and firefox.mjs.
// `openAbout()` opens pages/about.html, `openDocs(hash)` pages/docs.html.
import { waitFor } from "./checks.mjs";

const EXPECTED_SECTIONS = ["getting-started", "palette-ai", "window", "site-profiles", "assets", "troubleshooting", "whats-new"];
const EXPECTED_FAQ = ["window-moved", "window-off-screen", "url-pattern", "profile-elements", "unsaved-changes", "file-hub"];
// Words that would mean internal details leaked into the user docs.
const JARGON = /scripts\/|\.mjs\b|\bstorage\.local\b|lazymod_|innerHTML|content script|service worker|module/i;

const ABOUT_STATE = `(() => ({
  ready: Boolean(document.getElementById("about-version")?.textContent),
  version: document.getElementById("about-version").textContent,
  manifestVersion: "v" + chrome.runtime.getManifest().version,
  highlights: [...document.querySelectorAll("#highlights .card h3")].map((heading) => heading.textContent),
  docsHref: document.getElementById("about-open-docs")?.getAttribute("href"),
  docsLinks: [...document.querySelectorAll('a[href^="docs.html"]')].map((link) => link.getAttribute("href")),
  releaseNotes: Boolean(document.querySelector("#whats-new, .showcase, .demo")) || /What's new in|NEW IN 1\\./.test(document.body.textContent),
  words: document.querySelector("main").textContent.trim().split(/\\s+/).length,
}))()`;

const DOCS_STATE = `(() => {
  const section = document.querySelector("#docs-content .docs-section");
  return {
    nav: [...document.querySelectorAll("#docs-nav .docs-nav-link")].map((link) => link.dataset.section),
    active: [...document.querySelectorAll("#docs-nav .docs-nav-link.active")].map((link) => link.dataset.section),
    current: document.querySelector("#docs-nav [aria-current='page']")?.dataset.section || "",
    section: section?.dataset.section || "",
    title: section?.querySelector("h1")?.textContent || "",
    blocks: section ? section.children.length : 0,
    text: section?.textContent || "",
    internalLinks: [...(section?.querySelectorAll("a[href^='#']") || [])].map((link) => link.getAttribute("href")),
    externalLinks: [...(section?.querySelectorAll("a[href^='http']") || [])].map((link) => ({ href: link.href, target: link.target, rel: link.rel })),
    faq: [...(section?.querySelectorAll("details[data-faq]") || [])].map((item) => ({ id: item.dataset.faq, open: item.open })),
    badges: [...(section?.querySelectorAll(".docs-badge") || [])].map((badge) => badge.textContent),
    version: document.getElementById("docs-version").textContent,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
})()`;
const clickNav = (id) => `(() => { document.querySelector('#docs-nav [data-section="${id}"]').click(); return true; })()`;
const setHash = (hash) => `(() => { location.hash = ${JSON.stringify(hash)}; return true; })()`;

export async function runAboutChecks({ openAbout, openDocs, evaluate, check }) {
  const about = await waitFor(evaluate, await openAbout(), ABOUT_STATE, (state) => state?.ready, 10000);
  check(
    "About: short overview with 4 highlights, the installed version badge, and Open the Docs; no release notes",
    about.version === about.manifestVersion &&
      about.highlights.length === 4 &&
      about.docsHref === "docs.html" &&
      about.docsLinks.includes("docs.html#troubleshooting") &&
      about.docsLinks.includes("docs.html#whats-new") &&
      !about.releaseNotes &&
      about.words < 350,
    about,
  );

  const page = await openDocs();
  const first = await waitFor(evaluate, page, DOCS_STATE, (state) => state?.section, 10000);
  check(
    "Docs: sidebar lists the 7 sections in order; the first opens by default; version badge",
    first.nav.join() === EXPECTED_SECTIONS.join() && first.section === "getting-started" && first.active.join() === "getting-started" && first.current === "getting-started" && /^v\d+\.\d+\.\d+$/.test(first.version),
    { nav: first.nav, section: first.section, active: first.active, version: first.version },
  );

  // Every sidebar link shows its section; collect links and text along the way.
  const visited = [];
  for (const id of EXPECTED_SECTIONS) {
    await evaluate(page, clickNav(id));
    visited.push(await waitFor(evaluate, page, DOCS_STATE, (state) => state.section === id, 3000));
  }
  const brokenLinks = visited.flatMap((state) => state.internalLinks.filter((href) => !EXPECTED_SECTIONS.includes(href.slice(1).split("/")[0])));
  const unsafeExternal = visited.flatMap((state) => state.externalLinks.filter((link) => !link.href.startsWith("https://") || link.target !== "_blank" || !/noopener/.test(link.rel)));
  const jargon = visited.filter((state) => JARGON.test(state.text)).map((state) => `${state.section}: ${state.text.match(JARGON)[0]}`);
  check(
    "Docs: each sidebar link shows its section (title, content, active item); links resolve; external links open safely; no internal jargon",
    visited.every((state, index) => state.section === EXPECTED_SECTIONS[index] && state.active.join() === state.section && state.title && state.blocks >= 3) &&
      brokenLinks.length === 0 &&
      unsafeExternal.length === 0 &&
      jargon.length === 0 &&
      visited.every((state) => !state.overflow),
    { sections: visited.map((state) => [state.section, state.title, state.blocks]), brokenLinks, unsafeExternal, jargon },
  );

  const troubleshooting = visited.find((state) => state.section === "troubleshooting");
  const whatsNew = visited.find((state) => state.section === "whats-new");
  check(
    "Docs: Troubleshooting answers the common questions; What's New has v1.2.0 and v1.1.0",
    EXPECTED_FAQ.every((id) => troubleshooting.faq.some((item) => item.id === id)) && whatsNew.badges.includes("v1.2.0") && whatsNew.badges.includes("v1.1.0"),
    { faq: troubleshooting.faq.map((item) => item.id), badges: whatsNew.badges },
  );

  // Addresses: a question deep link opens it; unknown addresses fall back.
  await evaluate(page, setHash("#troubleshooting/url-pattern"));
  const deep = await waitFor(evaluate, page, DOCS_STATE, (state) => state.section === "troubleshooting" && state.faq.some((item) => item.open), 3000);
  await evaluate(page, setHash("#no-such-section"));
  const unknown = await waitFor(evaluate, page, DOCS_STATE, (state) => state.section === "getting-started", 3000);
  const direct = await waitFor(evaluate, await openDocs("#whats-new"), DOCS_STATE, (state) => state?.section, 10000);
  check(
    "Docs: docs.html#section opens that section, #troubleshooting/<question> opens the question, unknown addresses show Getting Started",
    deep.faq.filter((item) => item.open).map((item) => item.id).join() === "url-pattern" && unknown.section === "getting-started" && direct.section === "whats-new",
    { deep: deep.faq, unknown: unknown.section, direct: direct.section },
  );
}
