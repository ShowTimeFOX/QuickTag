// Textarea with a line-number gutter and current-line highlight. In word-wrap
// mode, wrapped line heights are measured with an off-screen mirror so the
// gutter stays aligned.

const LINE_HEIGHT = 24;

export function createCodeEditor({ container, textarea, lineNumbers, activeLine }) {
  let lineHeights = [];

  function isWordWrapped() {
    return container.classList.contains("word-wrap");
  }

  function measureWrappedLineHeights(lines) {
    if (!isWordWrapped()) return lines.map(() => LINE_HEIGHT);

    const computedStyle = getComputedStyle(textarea);
    const horizontalPadding = parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.paddingRight);
    const wrapStyle = { whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "normal" };
    const mirror = document.createElement("div");
    Object.assign(mirror.style, {
      position: "fixed",
      top: "0",
      left: "-100000px",
      width: `${Math.max(1, textarea.clientWidth - horizontalPadding)}px`,
      padding: "0",
      border: "0",
      visibility: "hidden",
      fontFamily: computedStyle.fontFamily,
      fontSize: computedStyle.fontSize,
      fontWeight: computedStyle.fontWeight,
      fontStyle: computedStyle.fontStyle,
      letterSpacing: computedStyle.letterSpacing,
      lineHeight: computedStyle.lineHeight,
      tabSize: computedStyle.tabSize,
      ...wrapStyle,
    });

    const lineElements = lines.map((line) => {
      const element = document.createElement("div");
      element.textContent = line || "​";
      Object.assign(element.style, { minHeight: `${LINE_HEIGHT}px`, ...wrapStyle });
      mirror.appendChild(element);
      return element;
    });
    document.body.appendChild(mirror);
    const heights = lineElements.map((element) => Math.max(LINE_HEIGHT, Math.ceil(element.getBoundingClientRect().height / LINE_HEIGHT) * LINE_HEIGHT));
    mirror.remove();
    return heights;
  }

  function updateActiveLine() {
    const lineIndex = textarea.value.slice(0, textarea.selectionStart).split("\n").length - 1;
    const lineOffset = lineHeights.slice(0, lineIndex).reduce((total, height) => total + height, 0);
    activeLine.style.height = `${lineHeights[lineIndex] || LINE_HEIGHT}px`;
    activeLine.style.transform = `translateY(${lineOffset - textarea.scrollTop}px)`;
    lineNumbers.style.transform = `translateY(${-textarea.scrollTop}px)`;
  }

  function updateLineNumbers() {
    const lines = textarea.value.split("\n");
    lineHeights = measureWrappedLineHeights(lines);
    lineNumbers.replaceChildren(
      ...lines.map((_, index) => {
        const lineNumber = document.createElement("span");
        lineNumber.textContent = String(index + 1);
        lineNumber.style.height = `${lineHeights[index]}px`;
        return lineNumber;
      }),
    );
    updateActiveLine();
  }

  function resetScroll() {
    textarea.scrollTop = 0;
    textarea.scrollLeft = 0;
  }

  /** Replaces the content and scrolls back to the top. */
  function setValue(value) {
    textarea.value = value;
    resetScroll();
    updateLineNumbers();
  }

  function setWordWrap(enabled) {
    container.classList.toggle("word-wrap", enabled);
    resetScroll();
    updateLineNumbers();
  }

  /** Inserts two spaces at the cursor (Tab key). */
  function insertIndent() {
    textarea.setRangeText("  ", textarea.selectionStart, textarea.selectionEnd, "end");
    updateLineNumbers();
  }

  textarea.addEventListener("input", updateLineNumbers);
  textarea.addEventListener("click", updateActiveLine);
  textarea.addEventListener("keyup", updateActiveLine);
  textarea.addEventListener("scroll", updateActiveLine);
  window.addEventListener("resize", updateLineNumbers);
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === textarea) updateActiveLine();
  });

  return { setValue, setWordWrap, insertIndent };
}
