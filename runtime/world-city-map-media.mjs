import { NIGHT_CITY_LOCATIONS } from "../data/night-city-catalog.mjs";
import { chooseArchiveImage } from "./archive-file-picker.mjs";
export const cityEsc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function safeWorldMapImagePath(value) {
  const path = String(value ?? "").trim();
  if (
    !path ||
    /[<>"'\u0000-\u001f\\]/u.test(path) ||
    path.startsWith("//") ||
    /^[a-z]:/i.test(path) ||
    path.startsWith("/")
  )
    return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    try {
      const u = new URL(path);
      return ["http:", "https:"].includes(u.protocol) &&
        !u.username &&
        !u.password
        ? path
        : "";
    } catch {
      return "";
    }
  }
  return path.split("/").some((p) => p === "..") ? "" : path;
}
export function normalizeWorldMapMedia(raw) {
  const gallery = [];
  for (const source of Array.isArray(raw?.gallery) ? raw.gallery : []) {
    const path = safeWorldMapImagePath(source?.path);
    const id = String(source?.id || `image-${gallery.length}`);
    if (path && !gallery.some((g) => g.id === id))
      gallery.push({
        id,
        path,
        caption: String(source?.caption ?? "").slice(0, 1000),
      });
  }
  const mode =
    raw?.mode === "hidden"
      ? "hidden"
      : raw?.mode === "custom" && gallery.length
        ? "custom"
        : "default";
  return {
    mode,
    coverId: gallery.some((g) => g.id === raw?.coverId)
      ? raw.coverId
      : gallery[0]?.id || "",
    gallery,
  };
}
export function resolveWorldMapMarkerMedia(marker) {
  const media = normalizeWorldMapMedia(marker?.media);
  if (media.mode === "hidden") return { ...media, cover: null, gallery: [] };
  if (media.mode === "custom")
    return {
      ...media,
      cover:
        media.gallery.find((g) => g.id === media.coverId) || media.gallery[0],
    };
  const id = String(marker?.catalogId ?? "").replace(/^ncm:/, "");
  const place = NIGHT_CITY_LOCATIONS.find((p) => p.id === id);
  const cover = place
    ? { id: "builtin", path: place.image, caption: place.name }
    : null;
  return { mode: "default", cover, gallery: cover ? [cover] : [] };
}
function requireGM() {
  if (!globalThis.game?.user?.isGM)
    throw new Error("Показ и изменение фотографий доступны только ведущему.");
}
export async function showWorldMapImageToPlayers({ path, title }) {
  requireGM();
  const src = safeWorldMapImagePath(path);
  if (!src) throw new Error("Неверный путь изображения.");
  const ImagePopout = globalThis.foundry?.applications?.apps?.ImagePopout;
  if (!ImagePopout) throw new Error("Просмотр фотографий Foundry недоступен.");
  const app = new ImagePopout({
    src,
    window: { title: String(title || "Найт-Сити") },
  });
  await app.render(true);
  app.shareImage();
  return app;
}
export async function openWorldMapImage({ path, title }) {
  const src = safeWorldMapImagePath(path);
  if (!src) return null;
  const Base = globalThis.foundry?.applications?.apps?.ImagePopout;
  if (!Base) {
    globalThis.ui?.notifications?.warn?.(
      "Просмотр фотографий Foundry недоступен.",
    );
    return null;
  }
  const opener = globalThis.document?.activeElement;
  const Viewer = class extends Base {
    async _onRender(context, options) {
      await super._onRender?.(context, options);
      this.events?.abort();
      this.events = new AbortController();
      const img = this.element.querySelector("img");
      if (!img) return;
      this.zoom = 1;
      this.offset = { x: 0, y: 0 };
      let drag = null;
      const update = () => {
        img.style.transform = `translate(${this.offset.x}px,${this.offset.y}px) scale(${this.zoom})`;
      };
      const area = img.parentElement;
      area.style.overflow = "hidden";
      img.style.transformOrigin = "center";
      img.draggable = false;
      area.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          this.zoom = Math.max(
            1,
            Math.min(6, this.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)),
          );
          if (this.zoom === 1) this.offset = { x: 0, y: 0 };
          update();
        },
        { passive: false, signal: this.events.signal },
      );
      area.addEventListener(
        "pointerdown",
        (e) => {
          if (e.button !== 0) return;
          drag = {
            x: e.clientX,
            y: e.clientY,
            ox: this.offset.x,
            oy: this.offset.y,
          };
          area.setPointerCapture?.(e.pointerId);
        },
        { signal: this.events.signal },
      );
      area.addEventListener(
        "pointermove",
        (e) => {
          if (drag && this.zoom > 1) {
            this.offset = {
              x: drag.ox + e.clientX - drag.x,
              y: drag.oy + e.clientY - drag.y,
            };
            update();
          }
        },
        { signal: this.events.signal },
      );
      area.addEventListener(
        "pointerup",
        () => {
          drag = null;
        },
        { signal: this.events.signal },
      );
      area.addEventListener(
        "pointercancel",
        () => {
          drag = null;
        },
        { signal: this.events.signal },
      );
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "city-photo-reset";
      reset.textContent = "Сброс масштаба";
      reset.addEventListener(
        "click",
        () => {
          this.zoom = 1;
          this.offset = { x: 0, y: 0 };
          update();
        },
        { signal: this.events.signal },
      );
      area.append(reset);
      this.element.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            void this.close();
          }
        },
        { signal: this.events.signal },
      );
    }
    _onClose(options) {
      this.events?.abort();
      opener?.focus?.();
      return super._onClose?.(options);
    }
  };
  const app = new Viewer({
    src,
    classes: ["city-photo-viewer"],
    position: { width: 900, height: 660 },
    window: { title: String(title || "Найт-Сити"), resizable: true },
  });
  await app.render(true);
  return app;
}
export function worldMapMediaHtml(marker, { isGM = false } = {}) {
  const media = resolveWorldMapMarkerMedia(marker),
    cover = media.cover;
  const thumbs = media.gallery
    .map(
      (g) =>
        `<div><button type="button" data-city-media-action="view" data-image-id="${cityEsc(g.id)}"><img loading="lazy" src="${cityEsc(g.path)}" alt="${cityEsc(g.caption)}"></button><small>${cityEsc(g.caption)}</small></div>`,
    )
    .join("");
  const editing = isGM
    ? `<details class="city-media-editor"><summary>Фото и галерея</summary><div class="city-gallery">${media.gallery.map((g) => `<div><img loading="lazy" src="${cityEsc(g.path)}" alt="${cityEsc(g.caption)}"><input data-city-media-caption="${cityEsc(g.id)}" value="${cityEsc(g.caption)}" aria-label="Подпись фото"><div><button type="button" data-city-media-action="cover" data-image-id="${cityEsc(g.id)}" title="Сделать обложкой">★</button><button type="button" data-city-media-action="replace" data-image-id="${cityEsc(g.id)}" title="Заменить фото">↻</button><button type="button" data-city-media-action="delete" data-image-id="${cityEsc(g.id)}" title="Удалить фото">×</button></div></div>`).join("")}</div><div class="city-media-controls"><button type="button" data-city-media-action="add">+ Фото</button><button type="button" data-city-media-action="default">Встроенное фото</button><button type="button" data-city-media-action="hide">Без фото</button></div><div class="city-media-path"><input data-city-media-path placeholder="Путь к изображению" aria-label="Путь к изображению"><button type="button" data-city-media-action="path">Добавить</button></div></details>`
    : "";
  return `<section class="city-dossier-media" data-city-media-marker="${cityEsc(marker.id)}">${cover ? `<button class="city-dossier-cover" type="button" data-city-media-action="view" data-image-id="${cityEsc(cover.id)}" aria-label="Увеличить фотографию"><img loading="lazy" src="${cityEsc(cover.path)}" alt="${cityEsc(marker.title)}"><span>⊕ Увеличить</span></button>` : '<div class="city-photo-placeholder">Фотография места не добавлена</div>'}${media.gallery.length > 1 ? `<div class="city-gallery">${thumbs}</div>` : ""}${isGM && cover ? '<button type="button" data-city-media-action="share">Показать фото игрокам</button>' : ""}${editing}</section>`;
}
export function bindWorldMapImageErrors(root, signal) {
  root.addEventListener(
    "error",
    (e) => {
      if (e.target?.tagName !== "IMG") return;
      const img = e.target;
      img.hidden = true;
      const placeholder = document.createElement("span");
      placeholder.className = "city-photo-placeholder";
      placeholder.textContent = "Фото недоступно";
      img.after(placeholder);
    },
    { capture: true, signal },
  );
}
export async function handleWorldMapMediaAction(button, marker, refresh) {
  const action = button?.dataset?.cityMediaAction;
  if (!action) return false;
  const media = resolveWorldMapMarkerMedia(marker);
  const image =
    media.gallery.find((g) => g.id === button.dataset.imageId) || media.cover;
  if (action === "view") {
    if (image)
      await openWorldMapImage({ path: image.path, title: marker.title });
    return true;
  }
  requireGM();
  if (action === "share") {
    if (image)
      await showWorldMapImageToPlayers({
        path: image.path,
        title: marker.title,
      });
    return true;
  }
  const save = async (next) => {
    const { updateWorldMapMarker } = await import("./world-city-map.mjs");
    await updateWorldMapMarker(marker.id, { media: next });
    refresh?.();
  };
  const add = async (path) => {
    path = safeWorldMapImagePath(path);
    if (!path) {
      ui.notifications?.warn?.("Укажите путь изображения Foundry.");
      return;
    }
    const id = globalThis.crypto?.randomUUID?.() || `img-${Date.now()}`;
    await save({
      mode: "custom",
      coverId: id,
      gallery: [...media.gallery, { id, path, caption: "" }],
    });
  };
  if (action === "add")
    chooseArchiveImage(
      "",
      (path) =>
        void add(path).catch((error) =>
          ui.notifications?.error?.(error.message),
        ),
    );
  if (action === "path")
    await add(
      button
        .closest("[data-city-media-marker]")
        ?.querySelector("[data-city-media-path]")?.value,
    );
  if (action === "replace" && image)
    chooseArchiveImage(
      image.path,
      (path) =>
        void save({
          mode: "custom",
          coverId: media.cover?.id,
          gallery: media.gallery.map((g) =>
            g.id === image.id ? { ...g, path } : g,
          ),
        }).catch((error) => ui.notifications?.error?.(error.message)),
    );
  if (action === "cover" && image)
    await save({ mode: "custom", coverId: image.id, gallery: media.gallery });
  if (action === "delete" && image)
    await save({
      mode: "custom",
      coverId: media.cover?.id,
      gallery: media.gallery.filter((g) => g.id !== image.id),
    });
  if (action === "default" || action === "hide")
    await save({ mode: action === "hide" ? "hidden" : "default", gallery: [] });
  return true;
}
export async function saveWorldMapImageCaption(marker, imageId, caption) {
  requireGM();
  const media = resolveWorldMapMarkerMedia(marker);
  const { updateWorldMapMarker } = await import("./world-city-map.mjs");
  return updateWorldMapMarker(marker.id, {
    media: {
      mode: "custom",
      coverId: media.cover?.id,
      gallery: media.gallery.map((g) =>
        g.id === imageId ? { ...g, caption } : g,
      ),
    },
  });
}
