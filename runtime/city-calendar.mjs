import {
  cityServices,
  updateCityServices,
  requireCityGM,
} from "./city-services-state.mjs";
import { getWorldCityMap, updateWorldCityMap } from "./world-city-map.mjs";
import {
  CITY_CALENDAR_HOLIDAYS,
  buildCityCalendar,
} from "../data/city-calendar.mjs";
export const CITY_CALENDAR_ID = "foundryvtt-simple-calendar";
const api = () =>
  game.modules?.get(CITY_CALENDAR_ID)?.active
    ? globalThis.SimpleCalendar?.api
    : null;
function isoFromCalendar(d) {
  if (
    !d ||
    !["year", "month", "day", "hour", "minute"].every((k) =>
      Number.isFinite(d[k]),
    )
  )
    throw new Error("Календарь вернул неверную дату.");
  const date = new Date(
    Date.UTC(d.year, d.month, d.day + 1, d.hour, d.minute, d.seconds || 0),
  );
  if (date.getUTCMonth() !== d.month || date.getUTCDate() !== d.day + 1)
    throw new Error("Для Найт-Сити требуется григорианская дата.");
  return date.toISOString();
}
function internal(worldTime) {
  const c = getWorldCityMap().clock || {
    anchorDate: "2045-07-14T20:00:00Z",
    anchorWorldTime: 0,
  };
  return new Date(
    Date.parse(c.anchorDate) + (worldTime - c.anchorWorldTime) * 1000,
  ).toISOString();
}
export function cityCalendarStatus() {
  const a = api();
  if (!a)
    return {
      available: false,
      reason: "Simple Calendar не включён или API недоступен.",
    };
  if (
    typeof a.timestampToDate !== "function" ||
    typeof a.dateToTimestamp !== "function"
  )
    return {
      available: false,
      reason: "Версия API календаря не поддерживается.",
    };
  try {
    return {
      available: true,
      iso: isoFromCalendar(a.timestampToDate(Number(game.time.worldTime) || 0)),
    };
  } catch (e) {
    return { available: false, reason: e.message };
  }
}
export function getCityCampaignTime(
  worldTime = Number(game.time?.worldTime) || 0,
) {
  let iso,
    warning = "";
  if (cityServices().calendarMode === "simple-calendar") {
    try {
      const status = cityCalendarStatus();
      if (!status.available) throw new Error(status.reason);
      iso = isoFromCalendar(api().timestampToDate(worldTime));
    } catch (e) {
      warning = e.message;
    }
  }
  iso ||= internal(worldTime);
  const d = new Date(iso);
  return {
    iso,
    time: iso.slice(11, 16),
    night: d.getUTCHours() < 6 || d.getUTCHours() >= 20,
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    warning,
    source:
      warning || cityServices().calendarMode !== "simple-calendar"
        ? "internal"
        : "simple-calendar",
  };
}
export async function setCityCalendarMode(mode) {
  requireCityGM();
  if (!["internal", "simple-calendar"].includes(mode))
    throw new Error("Неверный источник времени.");
  if (mode === "simple-calendar" && !cityCalendarStatus().available)
    throw new Error(cityCalendarStatus().reason);
  await updateCityServices((s) => {
    s.calendarMode = mode;
  });
}
export async function setCityCampaignDate(iso) {
  requireCityGM();
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) throw new Error("Неверная дата кампании.");
  if (cityServices().calendarMode === "simple-calendar") {
    if (!cityCalendarStatus().available)
      throw new Error(cityCalendarStatus().reason);
    const target = api().dateToTimestamp({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      day: d.getUTCDate() - 1,
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      seconds: d.getUTCSeconds(),
    });
    if (!Number.isFinite(target)) throw new Error("Календарь не принял дату.");
    await game.time.advance(target - game.time.worldTime);
  } else
    await updateWorldCityMap((s) => {
      s.clock = {
        anchorDate: d.toISOString(),
        anchorWorldTime: Number(game.time.worldTime) || 0,
      };
    });
  return getCityCampaignTime();
}
export async function setupCityCalendar({ holidays = true, backup } = {}) {
  requireCityGM();
  const a = api();
  if (!a?.configureCalendar)
    throw new Error("Настройка Simple Calendar недоступна в этой версии API.");
  const current = a.getCurrentCalendar?.();
  if (current) {
    if (typeof backup !== "function")
      throw new Error("Сначала сохраните копию текущего календаря.");
    await backup(structuredClone(current));
  }
  const response = await globalThis.fetch(
    `modules/${CITY_CALENDAR_ID}/predefined-calendars/gregorian.json`,
  );
  if (!response.ok)
    throw new Error("Григорианский шаблон Simple Calendar недоступен.");
  const base = await response.json();
  if (!base.calendar) throw new Error("Повреждён шаблон календаря.");
  const date = new Date(getCityCampaignTime().iso);
  if (
    (await a.configureCalendar(buildCityCalendar(base.calendar, date))) !== true
  )
    throw new Error("Simple Calendar не принял настройки.");
  if (holidays && a.addNote) {
    const have = new Set((a.getNotes?.() || []).map((n) => n.name));
    for (const h of CITY_CALENDAR_HOLIDAYS)
      if (!have.has(h.title)) {
        const day = {
          year: date.getUTCFullYear(),
          month: h.m - 1,
          day: h.d - 1,
          hour: 0,
          minute: 0,
          seconds: 0,
        };
        await a.addNote(h.title, `<p>${h.text}</p>`, day, day, true, 3, [
          "Праздник",
        ]);
        have.add(h.title);
      }
  }
  await setCityCalendarMode("simple-calendar");
  await setCityCampaignDate(date.toISOString());
  return getCityCampaignTime();
}
