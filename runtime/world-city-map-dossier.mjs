import { getWorldCityMap, WORLD_MAP_THREATS } from "./world-city-map.mjs";
import { worldMapPointInPolygon } from "./world-city-map-leaflet.mjs";
import {
  resolveWorldMapMarkerMedia,
  worldMapMediaHtml,
  cityEsc,
  handleWorldMapMediaAction,
  bindWorldMapImageErrors,
  saveWorldMapImageCaption,
} from "./world-city-map-media.mjs";
import { listWorldMapArchiveRecords } from "./world-city-map-archive.mjs";
export function getWorldMapDossier({
  marker,
  state,
  archiveRecords = [],
  links = marker.links || [],
}) {
  const regions = (state?.regions || [])
    .filter((r) => worldMapPointInPolygon(marker, r.points))
    .map((r) => ({
      id: r.id,
      name: r.name,
      threat: r.threat || "unknown",
      controller: r.controller || "",
      services: r.services || [],
    }));
  const archiveLinks = links.map((link) => {
    const matches = archiveRecords.filter(
      (r) =>
        r.actorId === link.actorId &&
        r.section === link.section &&
        r.entryId === link.entryId &&
        (!link.ownerUserId || link.ownerUserId === r.ownerUserId),
    );
    return { link, record: matches.length === 1 ? matches[0] : null };
  });
  return {
    id: marker.id,
    title: marker.title || "Место",
    description: marker.description || "",
    category:
      state?.categories?.find((c) => c.id === marker.categoryId)?.label ||
      "Место",
    regions,
    services: [...new Set(regions.flatMap((r) => r.services))],
    media: resolveWorldMapMarkerMedia(marker),
    archiveLinks,
    marker,
  };
}
export function publicWorldMapDossierPayload(dossier) {
  return {
    title: dossier.title,
    description: dossier.description,
    category: dossier.category,
    regions: dossier.regions.map((r) => ({
      name: r.name,
      threat: r.threat,
      controller: r.controller,
    })),
    services: [...dossier.services],
    image: dossier.media.cover?.path || "",
  };
}
export function worldMapDossierHtml(dossier, { isGM = false } = {}) {
  return `<article class="city-dossier" data-city-dossier="${cityEsc(dossier.id)}"><header><small>${cityEsc(dossier.category)} // ДОСЬЕ МЕСТА</small><h2>${cityEsc(dossier.title)}</h2></header>${worldMapMediaHtml(dossier.marker, { isGM })}<p class="city-dossier-description">${cityEsc(dossier.description) || "Описание не добавлено."}</p>${dossier.regions.map((r) => `<section class="city-dossier-region"><b>${cityEsc(r.name)}</b><span>Угроза: ${cityEsc(WORLD_MAP_THREATS[r.threat] || r.threat)} · ${cityEsc(r.controller || "Контроль не указан")}</span></section>`).join("")}${dossier.services.length ? `<p class="city-services">${dossier.services.map(cityEsc).join(" · ")}</p>` : ""}<div class="city-dossier-actions">${isGM ? '<button type="button" data-city-dossier-action="publish">Опубликовать карточку</button>' : ""}</div>${dossier.archiveLinks.map((r, i) => `<button type="button" data-city-dossier-action="archive" data-link-index="${i}"><i class="fa-solid fa-brain"></i> ${cityEsc(r.record?.title || "Открыть связанную запись")}</button>`).join("")}</article>`;
}
export async function publishWorldMapDossier(markerId, { imageId } = {}) {
  if (!game.user?.isGM) throw new Error("Публикация доступна только ведущему.");
  const state = getWorldCityMap();
  const marker = state.markers.find((m) => m.id === markerId);
  if (!marker) throw new Error("Место удалено.");
  const d = getWorldMapDossier({ marker, state });
  const payload = publicWorldMapDossierPayload(d);
  if (imageId)
    payload.image =
      d.media.gallery.find((g) => g.id === imageId)?.path || payload.image;
  return ChatMessage.create({
    speaker: { alias: "Найт-Сити" },
    content: `<article class="city-chat-dossier"><small>${cityEsc(payload.category)}</small><h3>${cityEsc(payload.title)}</h3>${payload.image ? `<img src="${cityEsc(payload.image)}" alt="${cityEsc(payload.title)}">` : ""}<p>${cityEsc(payload.description).replaceAll("\n", "<br>")}</p><p>${payload.regions.map((r) => cityEsc(r.name)).join(" · ")}</p></article>`,
  });
}
export async function openWorldMapDossier(
  markerId,
  { onArchiveLink, getArchiveContext } = {},
) {
  const { ApplicationV2, HandlebarsApplicationMixin } =
    foundry.applications.api;
  const App = class extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      classes: ["city-dossier-application"],
      position: { width: 820, height: 850 },
      window: { title: "Досье места", resizable: true },
    };
    static PARTS = {
      main: {
        template: "modules/cyberpunk-remaster/templates/world-city-dossier.hbs",
      },
    };
    async _prepareContext() {
      const state = getWorldCityMap();
      this.marker = state.markers.find((m) => m.id === markerId);
      if (!this.marker) return { dossierHtml: "Место удалено." };
      const archiveContext = getArchiveContext?.(this.marker) || {};
      this.dossier = getWorldMapDossier({
        marker: this.marker,
        state,
        archiveRecords:
          archiveContext.archiveRecords || listWorldMapArchiveRecords(),
        links: archiveContext.links || this.marker.links || [],
      });
      return {
        dossierHtml: worldMapDossierHtml(this.dossier, {
          isGM: game.user.isGM,
        }),
      };
    }
    async _onRender(context, options) {
      await super._onRender?.(context, options);
      this.events?.abort();
      this.events = new AbortController();
      bindWorldMapImageErrors(this.element, this.events.signal);
      this.element.addEventListener(
        "click",
        (e) => {
          void (async () => {
            const media = e.target.closest("[data-city-media-action]");
            if (media) {
              await handleWorldMapMediaAction(
                media,
                this.marker,
                () => void this.render(true),
              );
              return;
            }
            const b = e.target.closest("[data-city-dossier-action]");
            if (!b) return;
            if (b.dataset.cityDossierAction === "publish")
              await publishWorldMapDossier(markerId);
            if (b.dataset.cityDossierAction === "archive")
              await onArchiveLink?.(
                this.dossier.archiveLinks[Number(b.dataset.linkIndex)]?.link,
              );
          })().catch((err) => ui.notifications?.error?.(err.message));
        },
        { signal: this.events.signal },
      );
      this.element.addEventListener(
        "change",
        (e) => {
          if (e.target.matches("[data-city-media-caption]"))
            void saveWorldMapImageCaption(
              this.marker,
              e.target.dataset.cityMediaCaption,
              e.target.value,
            )
              .then(() => this.render(true))
              .catch((err) => ui.notifications?.error?.(err.message));
        },
        { signal: this.events.signal },
      );
    }
    _onClose(options) {
      this.events?.abort();
      return super._onClose?.(options);
    }
  };
  const app = new App();
  await app.render(true);
  return app;
}
