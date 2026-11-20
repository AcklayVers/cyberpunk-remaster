import { listCityJobs } from "./city-jobs.mjs";
import { mountWorldMapTools } from "./world-city-map-tools.mjs";
import {
  renderWorldCityMap,
  WORLD_MAP_ARCHIVE_FOCUS_ZOOM,
} from "./world-city-map-view.mjs";
import { registerWorldCityMapSetting } from "./world-city-map.mjs";
import {
  worldMapActorOwned,
  getWorldMapPositionMarkers,
} from "./world-city-map-positions.mjs";
import {
  listWorldMapArchiveRecords,
  resolveWorldMapArchiveLink,
} from "./world-city-map-archive.mjs";
import {
  directoryRoot,
  ensureDirectoryLauncherGroup,
} from "./directory-launchers.mjs";
const MID = "cyberpunk-remaster";
let instance = null,
  pending = null,
  AppClass = null;
async function openCityServicesPanel(options) {
  try {
    const { openCityServices } = await import("./city-services-ui.mjs");
    return await openCityServices(options);
  } catch (error) {
    ui.notifications?.error?.(String(error.message || error));
    return null;
  }
}
function validActor(id) {
  return worldMapActorOwned(globalThis.game?.actors?.get?.(String(id)))
    ? String(id)
    : "";
}
function size() {
  try {
    const p = JSON.parse(
      localStorage.getItem(`${MID}.city-window.v1`) || "null",
    );
    if (p && Number.isFinite(p.width) && Number.isFinite(p.height)) return p;
  } catch {}
  return { width: 1280, height: 860 };
}
async function openArchiveLink(link) {
  let result = resolveWorldMapArchiveLink(link);
  if (result.status === "ambiguous") {
    const Dialog = globalThis.foundry?.applications?.api?.DialogV2;
    const esc = (v) =>
      String(v).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
    const chosen = await Dialog?.prompt?.({
      window: { title: "Выберите архив" },
      content: `<select name="owner">${result.candidates.map((r) => `<option value="${esc(r.ownerUserId)}">${esc(game.users.get(r.ownerUserId)?.name || r.ownerUserId)}</option>`).join("")}</select>`,
      ok: {
        label: "Открыть",
        callback: (_event, button) => button.form.elements.owner.value,
      },
    });
    if (!chosen) return false;
    result = resolveWorldMapArchiveLink({ ...link, ownerUserId: chosen });
  }
  if (result.status !== "ready") {
    ui.notifications?.warn?.("Связанная запись удалена или недоступна.");
    return false;
  }
  const { openNeuroArchiveEntry } = await import("./neuro-archive-runtime.mjs");
  return openNeuroArchiveEntry(result.record);
}
function appClass() {
  if (AppClass) return AppClass;
  const { ApplicationV2, HandlebarsApplicationMixin } =
    foundry.applications.api;
  AppClass = class extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: "cyberpunk-night-city",
      tag: "section",
      classes: ["night-city-application"],
      position: { width: 1280, height: 860 },
      window: {
        title: "Найт-Сити",
        icon: "fa-solid fa-map-location-dot",
        resizable: true,
        minimizable: true,
        contentClasses: ["night-city-content"],
      },
    };
    static PARTS = {
      main: { template: `modules/${MID}/templates/world-city-map.hbs` },
    };
    constructor(options = {}) {
      super({ ...options, position: size() });
      this.activeActorId = validActor(options.activeActorId);
      this.focusMarkerId = String(options.focusMarkerId || "");
      this.mapController = null;
      this.toolsController = null;
      this.roleIsGM = !!game.user.isGM;
      this.events = null;
      this.hookIds = [];
      this.ownerUserId = game.user.id;
    }
    async _prepareContext() {
      const actors = Array.from(game.actors?.values?.() ?? game.actors ?? [])
        .filter(worldMapActorOwned)
        .map((a) => ({
          id: a.id,
          name: a.name,
          selected: a.id === this.activeActorId,
        }));
      return {
        actors,
        isGM: game.user.isGM,
        archiveOwners: game.user.isGM
          ? Array.from(game.users?.values?.() ?? []).map((u) => ({
              id: u.id,
              name: u.name,
              selected: u.id === this.ownerUserId,
            }))
          : [],
      };
    }
    backgroundKey() {
      return JSON.stringify([
        game.user.id,
        game.user.isGM,
        this.ownerUserId,
        this.activeActorId,
        Array.from(game.actors?.values?.() || []).map((a) => [
          a.id,
          a.name,
          worldMapActorOwned(a),
        ]),
        getWorldMapPositionMarkers(),
        listCityJobs()
          .filter((j) => ["offer", "active"].includes(j.status))
          .map((j) => [j.id, j.title, j.status, j.markerId]),
        Array.from(game.users?.values?.() || []).map((u) => [
          u.id,
          u.name,
          game.user.isGM || u.id === game.user.id
            ? listWorldMapArchiveRecords({ ownerUserId: u.id })
            : [],
        ]),
      ]);
    }
    async _onRender(context, options) {
      await super._onRender?.(context, options);
      this.toolsController?.destroy();
      this.mapController?.destroy();
      this.events?.abort();
      this.events = new AbortController();
      this.mapController = renderWorldCityMap(
        this.element.querySelector("[data-night-city-map-host]"),
        {
          activeActorId: this.activeActorId,
          focusMarkerId: this.focusMarkerId,
          focusZoom: this.focusMarkerId ? WORLD_MAP_ARCHIVE_FOCUS_ZOOM : null,
          listServiceMarkers: () =>
            listCityJobs()
              .filter((j) => ["offer", "active"].includes(j.status))
              .flatMap((j) => {
                const marker = this.mapController?.getMarker?.(j.markerId);
                return marker
                  ? [
                      {
                        ...marker,
                        id: `city-job:${j.id}`,
                        title:
                          j.status === "offer" ? "? · " + j.title : j.title,
                        cityJobId: j.id,
                        icon: "?",
                        draggable: false,
                      },
                    ]
                  : [];
              }),
          onServiceMarker: (marker) => {
            void openCityServicesPanel({
              tab: "jobs",
              actorId: this.activeActorId,
              jobId: marker.cityJobId,
            });
          },
          onCityServices: (options) => {
            return openCityServicesPanel({
              actorId: this.activeActorId,
              ...options,
            });
          },
          listArchiveRecords: () =>
            listWorldMapArchiveRecords({ ownerUserId: this.ownerUserId }),
          openArchiveLink,
        },
      );
      this.toolsController = mountWorldMapTools(this);
      this.lastBackgroundKey = this.backgroundKey();
      this.element.addEventListener(
        "change",
        (e) => {
          if (e.target.matches("[data-city-actor]")) {
            this.activeActorId = validActor(e.target.value);
            this.mapController.setActiveActor(this.activeActorId);
            this.lastBackgroundKey = this.backgroundKey();
          }
          if (e.target.matches("[data-city-archive-owner]") && game.user.isGM) {
            this.ownerUserId = e.target.value;
            this.mapController.refresh();
            this.lastBackgroundKey = this.backgroundKey();
          }
        },
        { signal: this.events.signal },
      );
      this.element.addEventListener(
        "click",
        async (e) => {
          const tool = e.target.closest("[data-city-open-tools]");
          if (tool) this.toolsController?.open(tool.dataset.cityOpenTools);
          if (e.target.closest("[data-city-open-agent]")) {
            const { openCityAgent } = await import("./city-agent-runtime.mjs");
            await openCityAgent({ actorId: this.activeActorId });
          }
          if (e.target.closest("[data-city-open-services]")) {
            await openCityServicesPanel({ actorId: this.activeActorId });
          }
          if (e.target.closest("[data-city-open-archive]")) {
            const { openNeuroArchive } =
              await import("./neuro-archive-runtime.mjs");
            await openNeuroArchive();
          }
        },
        { signal: this.events.signal },
      );
      if (!this.hookIds.length)
        for (const name of [
          "updateUser",
          "updateActor",
          "deleteActor",
          "cyberpunkRemasterCityServices",
          "createChatMessage",
        ]) {
          this.hookIds.push([
            name,
            Hooks.on(name, () => {
              if (this.roleIsGM !== !!game.user.isGM) {
                this.roleIsGM = !!game.user.isGM;
                this.ownerUserId = game.user.id;
                this.activeActorId = validActor(this.activeActorId);
                void this.render(true);
                return;
              }
              const id = validActor(this.activeActorId);
              if (id !== this.activeActorId) {
                this.activeActorId = id;
                const select = this.element.querySelector("[data-city-actor]");
                if (select) select.value = id;
                this.mapController?.setActiveActor(id);
              }
              const key = this.backgroundKey();
              if (key !== this.lastBackgroundKey) {
                this.lastBackgroundKey = key;
                this.mapController?.refresh();
              }
            }),
          ]);
        }
    }
    _onClose(options) {
      this.toolsController?.destroy();
      this.toolsController = null;
      this.mapController?.destroy();
      this.mapController = null;
      this.events?.abort();
      for (const [n, id] of this.hookIds) Hooks.off(n, id);
      this.hookIds = [];
      try {
        localStorage.setItem(
          `${MID}.city-window.v1`,
          JSON.stringify({
            width: this.position.width,
            height: this.position.height,
          }),
        );
      } catch {}
      if (instance === this) instance = null;
      return super._onClose?.(options);
    }
  };
  return AppClass;
}
export async function openWorldCityMap(options = {}) {
  if (game.system?.id !== "sf2e") {
    ui?.notifications?.error?.("Карта Найт-Сити работает в Starfinder 2e.");
    return null;
  }
  if (pending) await pending;
  if (instance?.rendered) {
    instance.bringToFront();
    if (options.activeActorId !== undefined) {
      instance.activeActorId = validActor(options.activeActorId);
      instance.mapController?.setActiveActor(instance.activeActorId);
      const select = instance.element?.querySelector?.("[data-city-actor]");
      if (select) select.value = instance.activeActorId;
    }
    if (options.focusMarkerId)
      instance.mapController?.focusMarker(options.focusMarkerId, {
        zoom: WORLD_MAP_ARCHIVE_FOCUS_ZOOM,
      });
    return instance;
  }
  instance = new (appClass())({
    ...options,
    activeActorId: validActor(
      options.activeActorId === undefined
        ? game.user.character?.id
        : options.activeActorId,
    ),
  });
  pending = instance.render(true);
  try {
    await pending;
  } catch (error) {
    instance = null;
    throw error;
  } finally {
    pending = null;
  }
  return instance;
}
function launcher(app, html) {
  const root = directoryRoot(app, html);
  if (!root || root.querySelector("[data-night-city-launcher]")) return;
  const group = ensureDirectoryLauncherGroup(app, html);
  if (!group) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.nightCityLauncher = "true";
  button.innerHTML = '<i class="fa-solid fa-map-location-dot"></i> Найт-Сити';
  button.addEventListener("click", () => void openWorldCityMap());
  group.append(button);
}
globalThis.Hooks?.once?.("init", () => {
  registerWorldCityMapSetting();
  const module = game.modules.get(MID);
  if (module)
    module.api = { ...(module.api ?? {}), cityMap: { open: openWorldCityMap } };
  globalThis.CyberpunkRemaster = {
    ...(globalThis.CyberpunkRemaster ?? {}),
    cityMap: openWorldCityMap,
  };
});
globalThis.Hooks?.on?.("renderActorDirectory", launcher);
