// Docs page renderer: turns the plain data in sections.js into DOM. Only
// createElement / textContent / setAttribute / replaceChildren; content text
// is never parsed as HTML.

const SVG_NS = "http://www.w3.org/2000/svg";

export function el(tagName, { className, text, attrs } = {}, children = []) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  Object.entries(attrs || {}).forEach(([name, value]) => element.setAttribute(name, value));
  element.append(...children.filter(Boolean));
  return element;
}

export function strokeIcon(pathData, className = "docs-icon") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathData);
  svg.appendChild(path);
  return svg;
}

export const versionBadge = (version, text = `v${version}`) => el("span", { className: "docs-badge", text, attrs: { title: `Since QuickTag ${version}` } });

// **bold**, `code`, [label](target)
const INLINE_PATTERN = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

function link(label, target) {
  if (target.startsWith("#")) return el("a", { className: "docs-link", text: label, attrs: { href: target } });
  if (/^https:\/\//.test(target)) {
    return el("a", { className: "docs-link", text: label, attrs: { href: target, target: "_blank", rel: "noopener noreferrer" } });
  }
  return document.createTextNode(label); // Unknown targets stay plain text.
}

/** Inline text → nodes. Bold may contain code and links. */
export function inline(text) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    if (match.index > last) nodes.push(document.createTextNode(text.slice(last, match.index)));
    const [, bold, code, label, target] = match;
    if (bold !== undefined) nodes.push(el("strong", {}, inline(bold)));
    else if (code !== undefined) nodes.push(el("code", { text: code }));
    else nodes.push(link(label, target));
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  return nodes;
}

function renderReleases(releases) {
  return el(
    "div",
    { className: "docs-releases" },
    releases.map((release) =>
      el("article", { className: "docs-release", attrs: { id: `release-${release.version}` } }, [
        el("header", { className: "docs-release-head" }, [
          el("span", { className: "docs-badge docs-badge-large", text: `v${release.version}` }),
          release.label ? el("span", { className: "docs-release-label", text: release.label }) : null,
        ]),
        el(
          "ul",
          { className: "docs-list" },
          release.highlights.map((item) => el("li", {}, inline(item))),
        ),
      ]),
    ),
  );
}

function renderFaq(items, sectionId) {
  return el(
    "div",
    { className: "docs-faq" },
    items.map((item) =>
      el("details", { className: "docs-faq-item", attrs: { id: `${sectionId}-${item.id}`, "data-faq": item.id } }, [
        el("summary", {}, inline(item.q)),
        el("div", { className: "docs-faq-body" }, renderBlocks(item.a, sectionId, null)),
      ]),
    ),
  );
}

function renderBlock(block, sectionId, releases) {
  if (block.heading !== undefined) {
    return el("h2", { className: "docs-heading" }, [...inline(block.heading), block.since ? versionBadge(block.since, `New in v${block.since}`) : null]);
  }
  if (block.p !== undefined) return el("p", {}, inline(block.p));
  if (block.steps) return el("ol", { className: "docs-steps" }, block.steps.map((step) => el("li", {}, inline(step))));
  if (block.list) return el("ul", { className: "docs-list" }, block.list.map((item) => el("li", {}, inline(item))));
  if (block.code !== undefined) return el("pre", {}, [el("code", { text: block.code })]);
  if (block.tip !== undefined) return el("p", { className: "docs-callout" }, inline(block.tip));
  if (block.warning !== undefined) return el("p", { className: "docs-callout docs-callout-warning" }, inline(block.warning));
  if (block.faq) return renderFaq(block.faq, sectionId);
  if (block.releases && releases) return renderReleases(releases);
  console.warn("[QuickTag] Unknown docs block:", block);
  return null;
}

export function renderBlocks(blocks, sectionId, releases) {
  return blocks.map((block) => renderBlock(block, sectionId, releases)).filter(Boolean);
}
