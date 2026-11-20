import { getWorldCityMap, WORLD_CITY_MAP_HOOK } from "./world-city-map.mjs";
import { getWorldMapActorPosition } from "./world-city-map-positions.mjs";
import { getCityCampaignTime } from "./city-calendar.mjs";
import {
  initializeWorldMapClock,
  setWorldMapCampaignDate,
  advanceWorldMapTime,
} from "./world-city-map-clock.mjs";
import {
  rollWorldMapEncounter,
  saveWorldMapEncounter,
  publishWorldMapEncounter,
  openWorldMapEncounterForge,
} from "./world-city-map-encounters.mjs";
import {
  NIGHT_CITY_ENCOUNTER_TYPES,
  NIGHT_CITY_ENCOUNTERS,
} from "../data/night-city-encounters.mjs";
import { worldMapPointInPolygon } from "./world-city-map-leaflet.mjs";
import { cityEsc as esc } from "./world-city-map-media.mjs";
const button = (action, label, attrs = "") =>
  `<button type="button" data-city-tool-action="${action}" ${attrs}>${label}</button>`;
const selected = (a, b) =>
  String(a || "") === String(b || "") ? "selected" : "";
export function worldMapToolsPanelHtml({
  isGM,
  state,
  tab = "clock",
  encounter = null,
  filters = {},
}) {
  const head = `<header class="city-tools-head"><div><small>НАЙТ-СИТИ // ГОРОДСКИЕ ИНСТРУМЕНТЫ</small><h3>${tab === "encounter" && isGM ? "Встречи в районе" : "Игровое время"}</h3></div>${button("close", "×", 'aria-label="Закрыть инструменты"')}</header><nav class="city-tools-tabs">${button("tab", "Часы", 'data-tab="clock"')}${isGM ? button("tab", "Встречи", 'data-tab="encounter"') : ""}</nav>`;
  if (tab !== "encounter" || !isGM)
    return (
      head +
      `<div class="city-tool-clock" data-city-clock-panel></div>${isGM ? `<label>Дата кампании<input type="datetime-local" data-city-date></label>${button("set-date", "Установить дату")}<div class="city-dossier-actions">${button("advance", "+15 минут", 'data-minutes="15"')}${button("advance", "+1 час", 'data-minutes="60"')}</div><label>Продвинуть на минут<input type="number" data-city-minutes value="30" min="0"></label>${button("advance-custom", "Продвинуть время")}` : "<p>Общие часы изменяет ведущий.</p>"}`
    );
  return (
    head +
    `<p class="city-encounter-intro">${NIGHT_CITY_ENCOUNTERS.length} событий · 8 видов. Последние пять встреч района не повторяются, пока есть другие подходящие.</p><label>Район<select data-city-encounter-district><option value="">Текущее место / положение</option>${(state.regions || []).map((r) => `<option value="${esc(r.id)}" ${selected(r.id, filters.districtId)}>${esc(r.name)}</option>`).join("")}</select></label><label>Вид события<select data-city-encounter-kind><option value="">Любой</option>${Object.entries(
      NIGHT_CITY_ENCOUNTER_TYPES,
    )
      .map(
        ([id, t]) =>
          `<option value="${id}" ${selected(id, filters.kind)}>${esc(t.label)}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="city-two-fields"><label>Уровень группы<input type="number" data-city-party-level value="${esc(filters.partyLevel ?? 3)}" min="-1" max="20"></label><label>Число участников<input type="number" data-city-party-size value="${esc(filters.partySize ?? 4)}" min="1" max="20"></label></div>${button("roll", "Бросить встречу", 'class="primary"')}${encounter ? `<article class="city-encounter-card"><small>${esc(encounter.districtName)} · ${encounter.night ? "Ночь" : "День"} · ${esc(encounter.kindLabel)}</small><h3>${esc(encounter.title)}</h3>${encounter.faction ? `<p class="city-encounter-faction">Контроль: ${esc(encounter.faction)}</p>` : ""}<p>${esc(encounter.publicText)}</p><details open><summary>Для ведущего</summary><p>${esc(encounter.gmText)}</p></details><div class="city-dossier-actions">${button("save-encounter", "Сохранить в журнал")}${button("publish-encounter", "Показать текст игрокам")}${button("forge", "Открыть Кузницу")}</div></article>` : "<p>Событие учитывает опасность, услуги района и время суток. Столкновение можно решить без боя.</p>"}`
  );
}
export function mountWorldMapTools(app) {
  const host = app.element.querySelector("[data-night-city-tools]");
  const events = new AbortController(),
    hooks = [];
  const gm = () => !!game.user?.isGM;
  let tab = "clock",
    encounter = null,
    busy = false;
  const filters = { districtId: "", kind: "", partyLevel: 3, partySize: 4 };
  const historyKey = `cyberpunk-remaster.encounters.v1:${game.world?.id || "world"}:${game.user.id}`;
  let history = {};
  try {
    const value = JSON.parse(localStorage.getItem(historyKey) || "{}");
    if (value && typeof value === "object" && !Array.isArray(value))
      history = value;
  } catch {}
  const error = (e) => ui.notifications?.error?.(e.message || String(e));
  function clock() {
    const value = getCityCampaignTime();
    const text = new Date(value.iso).toLocaleString("ru-RU", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const top = app.element.querySelector("[data-city-clock]");
    const label = text + ` · ${value.night ? "Ночь" : "День"}`;
    if (top && top.textContent !== label) top.textContent = label;
    const panel = host.querySelector("[data-city-clock-panel]");
    if (panel && panel.textContent !== text) panel.textContent = text;
    const input = host.querySelector("[data-city-date]");
    if (input && document.activeElement !== input)
      input.value = value.iso.slice(0, 16);
    app.element.classList.toggle("city-night", value.night);
  }
  function render() {
    host.innerHTML = worldMapToolsPanelHtml({
      isGM: gm(),
      state: getWorldCityMap(),
      tab,
      encounter,
      filters,
    });
    clock();
  }
  function readFilters() {
    if (tab !== "encounter") return;
    filters.districtId =
      host.querySelector("[data-city-encounter-district]")?.value || "";
    filters.kind =
      host.querySelector("[data-city-encounter-kind]")?.value || "";
    filters.partyLevel = Number(
      host.querySelector("[data-city-party-level]")?.value ?? 3,
    );
    filters.partySize = Number(
      host.querySelector("[data-city-party-size]")?.value ?? 4,
    );
  }
  async function action(b) {
    const name = b.dataset.cityToolAction;
    if (name === "close") {
      host.hidden = true;
      return;
    }
    if (name === "tab") {
      readFilters();
      const next = b.dataset.tab;
      if (
        !["clock", "encounter"].includes(next) ||
        (next === "encounter" && !gm())
      )
        return;
      tab = next;
      render();
      return;
    }
    if (!gm()) throw new Error("Это действие доступно ведущему.");
    if (name === "set-date") {
      const date = host.querySelector("[data-city-date]").value;
      if (!date) throw new Error("Укажи дату кампании.");
      await setWorldMapCampaignDate(date + "Z");
      clock();
      return;
    }
    if (name === "advance" || name === "advance-custom") {
      await advanceWorldMapTime(
        Number(
          name === "advance"
            ? b.dataset.minutes
            : host.querySelector("[data-city-minutes]").value,
        ),
      );
      clock();
      return;
    }
    if (name === "roll") {
      readFilters();
      const state = getWorldCityMap(),
        selection = app.mapController?.selection?.();
      const point =
        state.markers.find((m) => m.id === selection?.markerId) ||
        (app.activeActorId
          ? getWorldMapActorPosition(app.activeActorId)
          : state.partyPosition);
      const district = state.regions.find(
        (r) => r.id === (filters.districtId || selection?.regionId),
      ) ||
        state.regions.find(
          (r) => point && worldMapPointInPolygon(point, r.points),
        ) || { id: "", name: "Найт-Сити", threat: "unknown" };
      const key = district.id || "city";
      encounter = rollWorldMapEncounter({
        district: {
          ...district,
          point: point ? { x: point.x, y: point.y } : null,
        },
        night: getCityCampaignTime().night,
        kind: filters.kind,
        partyLevel: filters.partyLevel,
        partySize: filters.partySize,
        excludeIds: Array.isArray(history[key]) ? history[key] : [],
      });
      history[key] = [
        ...(Array.isArray(history[key]) ? history[key] : []),
        encounter.id,
      ].slice(-5);
      try {
        localStorage.setItem(historyKey, JSON.stringify(history));
      } catch {}
      render();
      return;
    }
    if (!encounter) return;
    if (name === "save-encounter") {
      await saveWorldMapEncounter(encounter);
      ui.notifications?.info?.("Встреча сохранена в закрытый журнал.");
    }
    if (name === "publish-encounter") await publishWorldMapEncounter(encounter);
    if (name === "forge") await openWorldMapEncounterForge(encounter);
  }
  host.addEventListener("change", readFilters, { signal: events.signal });
  host.addEventListener(
    "click",
    (e) => {
      const b = e.target.closest("[data-city-tool-action]");
      if (!b || busy) return;
      busy = true;
      void action(b)
        .catch(error)
        .finally(() => {
          busy = false;
        });
    },
    { signal: events.signal },
  );
  hooks.push(
    ["updateWorldTime", Hooks.on("updateWorldTime", clock)],
    [
      WORLD_CITY_MAP_HOOK,
      Hooks.on(WORLD_CITY_MAP_HOOK, () => {
        if (host.hidden) clock();
        else render();
      }),
    ],
  );
  if (
    gm() &&
    (!game.users?.activeGM || game.users.activeGM.id === game.user.id)
  )
    void initializeWorldMapClock().catch(error);
  render();
  return {
    open(next = "clock") {
      if (
        !["clock", "encounter"].includes(next) ||
        (next === "encounter" && !gm())
      )
        return;
      readFilters();
      tab = next;
      host.hidden = false;
      render();
    },
    destroy() {
      events.abort();
      for (const [n, id] of hooks) Hooks.off(n, id);
      host.innerHTML = "";
    },
  };
}
