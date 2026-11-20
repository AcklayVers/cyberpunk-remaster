const managedFontStyles = new WeakMap();
const resizeObservers = new WeakMap();

export const FONT_AWESOME_CLASSES = Object.freeze([
  "fa", "fas", "far", "fab", "fal", "fat", "fad", "fass", "fasr", "fasl", "fast",
  "fa-solid", "fa-regular", "fa-brands", "fa-light", "fa-thin", "fa-duotone", "fa-sharp",
]);

export const ICON_ONLY_SELECTOR = [
  ".pcm-top-actions > button > b",
  "aside > button > b",
  ".pcm-nav-toggle",
  ".pcm-record-arrow",
  ".pcm-attention-sign > b",
  ".pcm-stat-grid button > i",
  ".pcm-neuro-thread-row > i",
  "[data-window-toggle-icon]",
  ".pcm-hw-key",
  ".pcm-hw-led",
  ".pcm-hw-portbay",
  ".pcm-hw-radiator",
  ".pcm-hw-grip",
  ".pcm-hw-vent",
].join(",");

const TEXT_TAGS = new Set([
  "BUTTON", "INPUT", "SELECT", "TEXTAREA", "OPTION", "LABEL", "SPAN", "SMALL", "P",
  "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TD", "TH", "LEGEND", "SUMMARY",
  "OUTPUT", "EM", "STRONG", "B", "A", "CODE", "PRE", "TIME",
]);

export function archiveFontScale(fontSize, baseFontSize) {
  const size = Number(fontSize);
  const base = Number(baseFontSize);
  if (!Number.isFinite(size) || !Number.isFinite(base) || base <= 0) return 1;
  return size / base;
}

function archiveDensityScale(density) {
  if (density === "compact") return 0.9;
  if (density === "spacious") return 1.15;
  return 1;
}

function px(value) {
  return `${Math.max(1, Math.round(Number(value) * 100) / 100)}px`;
}

function ensureArchiveAppearanceRuntimeStyle(root) {
  if (!root?.append || !globalThis.document?.createElement) return null;
  let style = root.querySelector?.("style[data-archive-appearance-runtime]") ?? null;
  if (style) return style;
  style = globalThis.document.createElement("style");
  style.setAttribute("data-archive-appearance-runtime", "true");
  style.textContent = `
    #pcm-root#pcm-root{font-size:var(--archive-user-font-size,13px)!important;font-family:Arial,sans-serif!important}
    #pcm-root#pcm-root :where(div,section,article,header,footer,button,input,select,textarea,option,label,legend,summary,p,li,td,th,output,em,strong,a,code,pre,time,span,b,h1,h2,h3,h4,h5,h6){font-family:Arial,sans-serif!important}
    #pcm-root#pcm-root :where(button,input,select,textarea,option){font-family:Arial,sans-serif!important}

    /* 2.8.76 — typography only: structural geometry belongs to each archive tab */
    #pcm-root#pcm-root :where(small){font-size:var(--archive-font-small,10px)!important}
    #pcm-root#pcm-root :where(h1){font-size:var(--archive-font-h1,20px)!important}
    #pcm-root#pcm-root :where(h2){font-size:var(--archive-font-h2,17px)!important}
    #pcm-root#pcm-root :where(h3){font-size:var(--archive-font-h3,15px)!important}
    #pcm-root#pcm-root :where(h4,h5,h6){font-size:var(--archive-font-h4,13px)!important}
    #pcm-root#pcm-root i:not(.fa):not(.fas):not(.far):not(.fab):not(.fal):not(.fat):not(.fad):not(.fass):not(.fasr):not(.fasl):not(.fast):not(.fa-solid):not(.fa-regular):not(.fa-brands):not(.fa-light):not(.fa-thin):not(.fa-duotone):not(.fa-sharp):not([aria-hidden="true"]){font-size:var(--archive-font-small,10px)!important}
    #pcm-root#pcm-root :where(.pcm-nav-strip>button>b,.pcm-top-actions>button>b,aside>button>b,.pcm-nav-toggle,.pcm-record-arrow,.pcm-attention-sign>b,.pcm-stat-grid button>i,.pcm-neuro-thread-row>i,[data-window-toggle-icon]){font-size:var(--archive-icon-size,13px)!important}

    #pcm-root#pcm-root input,
    #pcm-root#pcm-root select{font-size:var(--archive-user-font-size,13px)!important}
    #pcm-root#pcm-root textarea{font-size:var(--archive-user-font-size,13px)!important}

    #pcm-root#pcm-root[data-effects=off] :where(.active,[data-save-badge],.pcm-attention-sign,.pcm-cyber-status,.pcm-scan-strip strong,.pcm-nav-header b,.pcm-theme-presets button.active){text-shadow:none!important;filter:none!important}
    #pcm-root#pcm-root[data-effects=off] :where(.pcm-nav-strip>button.active,aside>button.active,.pcm-theme-presets button.active){box-shadow:none!important}
    #pcm-root#pcm-root[data-effects=off] :where(.pcm-nav-strip>button::before,aside>button::before){box-shadow:none!important}

    #pcm-root#pcm-root[data-effects=soft] :where([data-save-badge],.pcm-attention-sign,.pcm-cyber-status,.pcm-scan-strip strong,.pcm-nav-header b,.pcm-theme-presets button.active){text-shadow:0 0 7px var(--gold)!important;filter:drop-shadow(0 0 2px var(--gold))!important}
    #pcm-root#pcm-root[data-effects=soft] :where(.pcm-nav-strip>button.active,aside>button.active,.pcm-theme-presets button.active){box-shadow:inset 0 0 0 1px var(--gold),0 0 9px color-mix(in srgb,var(--gold) 45%,transparent)!important}
    #pcm-root#pcm-root[data-effects=soft] :where(.pcm-nav-strip>button::before,aside>button::before){opacity:1!important;box-shadow:0 0 7px var(--teal)!important}

    #pcm-root#pcm-root[data-effects=vivid] :where([data-save-badge],.pcm-attention-sign,.pcm-cyber-status,.pcm-scan-strip strong,.pcm-nav-header b,.pcm-theme-presets button.active){text-shadow:0 0 5px var(--gold),0 0 13px var(--gold)!important;filter:drop-shadow(0 0 4px var(--gold))!important;animation:archiveAppearancePulse 1.6s ease-in-out infinite!important}
    #pcm-root#pcm-root[data-effects=vivid] :where(.pcm-nav-strip>button.active,aside>button.active,.pcm-theme-presets button.active){box-shadow:inset 0 0 0 1px var(--gold),0 0 15px color-mix(in srgb,var(--gold) 68%,transparent)!important}
    #pcm-root#pcm-root[data-effects=vivid] :where(.pcm-nav-strip>button::before,aside>button::before){opacity:1!important;box-shadow:0 0 5px var(--teal),0 0 12px var(--teal)!important}
    @keyframes archiveAppearancePulse{0%,100%{opacity:.82}50%{opacity:1}}
  `;
  root.append(style);
  return style;
}

function isFontAwesomeElement(element) {
  const classes = element?.classList;
  if (!classes) return false;
  for (const name of FONT_AWESOME_CLASSES) if (classes.contains(name)) return true;
  for (const name of classes) {
    if (/^fa-(?:solid|regular|brands|light|thin|duotone|sharp|[a-z0-9-]+)$/u.test(name)) return true;
  }
  return false;
}

function isIconOnlyElement(element) {
  if (!element || isFontAwesomeElement(element)) return true;
  try {
    if (element.matches?.(ICON_ONLY_SELECTOR)) return true;
  } catch {
    // Invalid selector support is not fatal; Foundry's browser supports it.
  }
  if (element.getAttribute?.("aria-hidden") === "true") return true;
  return ["SVG", "PATH", "IMG", "CANVAS"].includes(element.tagName);
}

function hasDirectText(element) {
  if (!element) return false;
  if (TEXT_TAGS.has(element.tagName)) return true;
  const nodes = Array.from(element.childNodes ?? []);
  return nodes.some((node) => node?.nodeType === 3 && String(node.textContent ?? "").trim());
}

function rememberOriginalFont(element) {
  if (managedFontStyles.has(element)) return managedFontStyles.get(element);
  const record = {
    value: element.style?.getPropertyValue?.("font-size") ?? "",
    priority: element.style?.getPropertyPriority?.("font-size") ?? "",
  };
  managedFontStyles.set(element, record);
  return record;
}

function restoreOriginalFont(element) {
  const record = managedFontStyles.get(element);
  if (!record || !element?.style) return;
  if (record.value) element.style.setProperty("font-size", record.value, record.priority);
  else element.style.removeProperty("font-size");
}

/**
 * Scale every real text surface from its responsive computed baseline.
 * Font Awesome and icon-only glyph cells are pinned to their baseline so text scaling
 * cannot break icon fonts or shove compact HUD symbols out of alignment.
 */
export function applyArchiveTextScale(root, { fontSize, baseFontSize } = {}) {
  if (!root?.style) return 1;
  const scale = archiveFontScale(fontSize, baseFontSize);
  const resolvedBase = Number.isFinite(Number(baseFontSize)) && Number(baseFontSize) > 0
    ? Number(baseFontSize)
    : Math.max(1, Number(fontSize) || 13);
  const resolvedFont = Number.isFinite(Number(fontSize)) && Number(fontSize) > 0
    ? Number(fontSize)
    : resolvedBase;
  const density = String(root.dataset?.density || "comfortable");
  const densityScale = archiveDensityScale(density);
  const componentScale = densityScale * Math.min(1.38, Math.max(0.95, scale));

  root.style.setProperty("font-size", px(resolvedFont), "important");
  root.style.setProperty("--archive-text-scale", String(scale));
  root.style.setProperty("--archive-base-font-size", px(resolvedBase));
  root.style.setProperty("--archive-user-font-size", px(resolvedFont));
  root.style.setProperty("--archive-font-small", px(resolvedFont * 0.78));
  root.style.setProperty("--archive-font-h1", px(resolvedFont * 1.55));
  root.style.setProperty("--archive-font-h2", px(resolvedFont * 1.30));
  root.style.setProperty("--archive-font-h3", px(resolvedFont * 1.12));
  root.style.setProperty("--archive-font-h4", px(resolvedFont));
  root.style.setProperty("--archive-icon-size", px(resolvedBase));
  root.style.setProperty("--archive-density-scale", String(densityScale));
  root.style.setProperty("--archive-gap", px(11 * densityScale));
  root.style.setProperty("--archive-card-pad", px(12 * densityScale));
  root.style.setProperty("--archive-main-pad", px(13 * densityScale));
  root.style.setProperty("--archive-control-height", px(36 * componentScale));
  root.style.setProperty("--archive-nav-height", px(42 * componentScale));
  root.style.setProperty("--archive-row-height", px(42 * componentScale));
  root.style.setProperty("--archive-textarea-height", px(58 * componentScale));
  root.style.setProperty("--archive-control-pad-y", px(7 * densityScale));
  ensureArchiveAppearanceRuntimeStyle(root);
  return scale;
}

export function observeArchiveTextScale(root, getOptions) {
  if (!root || typeof getOptions !== "function") return () => {};
  resizeObservers.get(root)?.disconnect?.();
  let frame = 0;
  let lastWidth = -1;
  let lastHeight = -1;
  const schedule = () => {
    if (frame) return;
    const run = () => {
      frame = 0;
      applyArchiveTextScale(root, getOptions() ?? {});
    };
    frame = globalThis.requestAnimationFrame?.(run) ?? globalThis.setTimeout?.(run, 0) ?? 0;
  };
  const Observer = globalThis.ResizeObserver;
  const observer = typeof Observer === "function"
    ? new Observer((entries) => {
        const rect = entries?.[0]?.contentRect;
        const width = Math.round(Number(rect?.width) || root.clientWidth || 0);
        const height = Math.round(Number(rect?.height) || root.clientHeight || 0);
        if (width === lastWidth && height === lastHeight) return;
        lastWidth = width;
        lastHeight = height;
        schedule();
      })
    : null;
  observer?.observe?.(root);
  resizeObservers.set(root, observer ?? { disconnect() {} });
  globalThis.queueMicrotask?.(schedule) ?? schedule();
  return () => {
    observer?.disconnect?.();
    resizeObservers.delete(root);
    if (frame && globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame(frame);
  };
}

export const ARCHIVE_CONTEXT_THEME_PROPERTIES = Object.freeze([
  "--bg", "--bg-alpha", "--panel", "--panel-alpha", "--panel2", "--ink", "--heading",
  "--muted", "--gold", "--teal", "--line", "--accent-soft", "--accent-hover", "--field",
  "--theme-node", "--theme-trace", "--theme-warning", "--theme-node-glow", "--theme-trace-glow",
  "--theme-warning-glow", "--font-size", "--archive-text-scale",
]);

export function contextMenuViewportPlacement({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  viewportWidth = 0,
  viewportHeight = 0,
  viewportLeft = 0,
  viewportTop = 0,
  margin = 8,
} = {}) {
  const safeMargin = Math.max(0, Number(margin) || 0);
  const leftEdge = Number(viewportLeft) || 0;
  const topEdge = Number(viewportTop) || 0;
  const vw = Math.max(1, Number(viewportWidth) || 1);
  const vh = Math.max(1, Number(viewportHeight) || 1);
  const maxWidth = Math.max(1, vw - safeMargin * 2);
  const maxHeight = Math.max(1, vh - safeMargin * 2);
  const menuWidth = Math.min(Math.max(0, Number(width) || 0), maxWidth);
  const menuHeight = Math.min(Math.max(0, Number(height) || 0), maxHeight);
  const minLeft = leftEdge + safeMargin;
  const minTop = topEdge + safeMargin;
  const maxLeft = leftEdge + vw - menuWidth - safeMargin;
  const maxTop = topEdge + vh - menuHeight - safeMargin;
  const wantedX = Number.isFinite(Number(x)) ? Number(x) : minLeft;
  const wantedY = Number.isFinite(Number(y)) ? Number(y) : minTop;
  return {
    left: Math.round(Math.max(minLeft, Math.min(wantedX, Math.max(minLeft, maxLeft)))),
    top: Math.round(Math.max(minTop, Math.min(wantedY, Math.max(minTop, maxTop)))),
    maxWidth: Math.round(maxWidth),
    maxHeight: Math.round(maxHeight),
  };
}

export function placeArchiveContextMenu(menu, x, y, { margin = 8 } = {}) {
  if (!menu) return null;
  const viewport = globalThis.visualViewport;
  const viewportLeft = Number(viewport?.offsetLeft) || 0;
  const viewportTop = Number(viewport?.offsetTop) || 0;
  const viewportWidth = Math.max(
    1,
    Number(viewport?.width) || Number(globalThis.innerWidth) || Number(globalThis.document?.documentElement?.clientWidth) || 1,
  );
  const viewportHeight = Math.max(
    1,
    Number(viewport?.height) || Number(globalThis.innerHeight) || Number(globalThis.document?.documentElement?.clientHeight) || 1,
  );
  const safeMargin = Math.max(0, Number(margin) || 0);
  menu.style.maxWidth = `${Math.max(1, viewportWidth - safeMargin * 2)}px`;
  menu.style.maxHeight = `${Math.max(1, viewportHeight - safeMargin * 2)}px`;
  const rect = menu.getBoundingClientRect?.() ?? { width: 0, height: 0 };
  const placement = contextMenuViewportPlacement({
    x,
    y,
    width: rect.width,
    height: rect.height,
    viewportWidth,
    viewportHeight,
    viewportLeft,
    viewportTop,
    margin: safeMargin,
  });
  menu.style.left = `${placement.left}px`;
  menu.style.top = `${placement.top}px`;
  menu.style.maxWidth = `${placement.maxWidth}px`;
  menu.style.maxHeight = `${placement.maxHeight}px`;
  return placement;
}

export function syncArchiveContextTheme(source, target, properties = ARCHIVE_CONTEXT_THEME_PROPERTIES) {
  if (!source || !target?.style) return;
  const computed = globalThis.getComputedStyle?.(source);
  for (const property of properties) {
    const value = computed?.getPropertyValue?.(property);
    if (value) target.style.setProperty(property, value.trim());
  }
  for (const key of ["shell", "effects", "density", "themeFx"]) {
    const value = source.dataset?.[key];
    if (value) target.dataset[key] = value;
  }
}

function copyFormControlState(source, target) {
  const sourceControls = source?.querySelectorAll?.("input, textarea, select") ?? [];
  const targetControls = target?.querySelectorAll?.("input, textarea, select") ?? [];
  for (let index = 0; index < Math.min(sourceControls.length, targetControls.length); index += 1) {
    const from = sourceControls[index];
    const to = targetControls[index];
    if ("value" in from && "value" in to) to.value = from.value;
    if ("checked" in from && "checked" in to) to.checked = from.checked;
    if ("selectedIndex" in from && "selectedIndex" in to) to.selectedIndex = from.selectedIndex;
  }
}

/**
 * Route a button pressed in a body-level context-menu portal back through the
 * archive root's existing click delegation without duplicating business logic.
 */
export function proxyArchiveContextAction(root, sourceButton) {
  const menu = sourceButton?.closest?.(".pcm-context-menu-surface");
  if (!root?.append || !menu || !sourceButton) return false;
  const sourceButtons = Array.from(menu.querySelectorAll?.("[data-action]") ?? []);
  const buttonIndex = sourceButtons.indexOf(sourceButton);
  if (buttonIndex < 0) return false;

  const clone = menu.cloneNode(true);
  clone.dataset.archiveContextProxy = "true";
  clone.style.display = "none";
  copyFormControlState(menu, clone);
  root.append(clone);
  const targetButton = Array.from(clone.querySelectorAll?.("[data-action]") ?? [])[buttonIndex];
  try {
    targetButton?.click?.();
    return Boolean(targetButton);
  } finally {
    clone.remove?.();
  }
}
