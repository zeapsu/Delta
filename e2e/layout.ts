import type { Page } from "@playwright/test";

// Layout rules a screenshot review tends to miss, checked in the page:
//  - nothing visible reaches past the edge of the screen,
//  - nothing sticks out of the card (or dialog) it sits in, and no control is
//    wider than its column,
//  - on phone widths every form field renders at 16px or more (below that iOS
//    zooms the page on focus).
// Content inside a horizontal scroller (tables in `overflow-x-auto`) or a
// clipping box is skipped: that is the intended place for wide content.
// Each problem names the element so the failure reads without a screenshot.
export function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const phone = width < 640;
    const problems: string[] = [];
    const flagged = new Set<Element>();

    const name = (el: Element) => {
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
      const text = (el.getAttribute("aria-label") ?? el.getAttribute("name") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""}>${text ? ` "${text}"` : ""}`;
    };
    // An ancestor that scrolls or clips sideways owns whatever is wider than it.
    const contained = (el: Element, stop: Element | null) => {
      for (let p = el.parentElement; p && p !== stop && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== "visible") return true;
      }
      return false;
    };
    const px = (n: number) => `${Math.round(n)}px`;

    for (const el of document.querySelectorAll("body *")) {
      // Inside an <svg> the root clips; only the root's own box matters.
      if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      // Reported once, at the outermost element that is off.
      if (el.parentElement && flagged.has(el.parentElement)) {
        flagged.add(el);
        continue;
      }

      const box = el.closest(".surface, dialog");
      if (!contained(el, null)) {
        const over = Math.max(r.right - width, -r.left);
        if (over > 1) {
          flagged.add(el);
          problems.push(`${name(el)} reaches ${px(over)} past the edge of the screen (${px(width)} wide)`);
          continue;
        }
      }
      if (box && box !== el && style.position !== "fixed" && !contained(el, box)) {
        const b = box.getBoundingClientRect();
        const over = Math.max(r.right - b.right, b.left - r.left);
        if (over > 1) {
          flagged.add(el);
          problems.push(`${name(el)} sticks ${px(over)} out of ${name(box).split(" ")[0]}`);
          continue;
        }
      }

      // A control wider than the column it was given (how the iOS date field
      // showed up) is off even while it is still inside the card's padding.
      if (el.matches("input, select, textarea, button") && el.parentElement && !contained(el, box)) {
        const p = el.parentElement.getBoundingClientRect();
        const over = Math.max(r.right - p.right, p.left - r.left);
        if (over > 1) {
          flagged.add(el);
          problems.push(`${name(el)} is ${px(over)} wider than the column it sits in`);
          continue;
        }
      }

      if (phone && el.matches("input, select, textarea")) {
        const type = el.getAttribute("type") ?? "";
        if (!["checkbox", "radio", "hidden", "range", "file"].includes(type) && parseFloat(style.fontSize) < 16) {
          problems.push(`${name(el)} renders at ${style.fontSize}: under 16px iOS zooms the page on focus`);
        }
      }
    }
    return problems;
  });
}
