import {
  NIGHT_CITY_ENCOUNTERS,
  NIGHT_CITY_ENCOUNTER_TYPES,
} from "../data/night-city-encounters.mjs";
import { cityEsc } from "./world-city-map-media.mjs";
const MID = "cyberpunk-remaster";
function requireGM() {
  if (!game.user?.isGM)
    throw new Error("Встречи сохраняет и публикует ведущий.");
}
function rng(seed) {
  let value = 2166136261;
  for (const ch of String(seed))
    value = Math.imul(value ^ ch.charCodeAt(0), 16777619);
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}
export function rollWorldMapEncounter({
  district = {},
  night = false,
  seed = globalThis.crypto?.randomUUID?.() || Date.now(),
  partyLevel = 3,
  partySize = 4,
  kind = "",
  excludeIds = [],
} = {}) {
  const random = rng(seed);
  const candidates = NIGHT_CITY_ENCOUNTERS.filter(
    (e) =>
      (e.time === "any" || e.time === (night ? "night" : "day")) &&
      (!e.threats.length || e.threats.includes(district.threat)) &&
      (!NIGHT_CITY_ENCOUNTER_TYPES[kind] || e.kind === kind),
  );
  const excluded = new Set(excludeIds),
    fresh = candidates.filter((e) => !excluded.has(e.id));
  const pool = fresh.length ? fresh : candidates;
  const districtText = [
    district.name,
    district.controller,
    ...(district.services || []),
  ]
    .join(" ")
    .toLocaleLowerCase("ru");
  const weighted = pool.flatMap((e) => {
    const dangerMatch =
      e.threats.includes(district.threat) ||
      (e.kind === "conflict" && ["combat", "hot"].includes(district.threat)) ||
      (e.kind === "corporate" && district.threat === "corporate");
    const localMatch = NIGHT_CITY_ENCOUNTER_TYPES[e.kind].words.some((word) =>
      districtText.includes(word),
    );
    return Array(1 + (dangerMatch ? 2 : 0) + (localMatch ? 2 : 0)).fill(e);
  });
  const event =
    weighted[Math.floor(random() * weighted.length)] ||
    NIGHT_CITY_ENCOUNTERS[3];
  const level = Math.max(-1, Math.min(20, Math.round(Number(partyLevel) || 0))),
    count = Math.max(
      1,
      Math.min(
        20,
        Math.round(Number(partySize) || 1) + (event.peaceful ? -2 : 0),
      ),
    );
  return {
    id: event.id,
    title: event.title,
    kind: event.kind,
    kindLabel: NIGHT_CITY_ENCOUNTER_TYPES[event.kind].label,
    publicText: event.publicText,
    gmText: event.gmText,
    districtId: district.id || "",
    districtName: district.name || "Неизвестный район",
    faction: district.controller || "",
    point: district.point || null,
    peaceful: event.peaceful,
    night,
    seed: String(seed),
    forgeValues: {
      preset: event.preset,
      level,
      count,
      randomSeed: String(seed),
      target: "new",
    },
  };
}
export async function saveWorldMapEncounter(result) {
  requireGM();
  return JournalEntry.create({
    name: `Встреча · ${result.title}`,
    ownership: { default: 0 },
    flags: { [MID]: { cityEncounter: structuredClone(result) } },
    pages: [
      {
        name: result.title,
        type: "text",
        ownership: { default: 0 },
        text: {
          format: 1,
          content: `<h2>${cityEsc(result.title)}</h2><p>${cityEsc(result.publicText)}</p><h3>Для ведущего</h3><p>${cityEsc(result.gmText)}</p>`,
        },
      },
    ],
  });
}
export async function publishWorldMapEncounter(result) {
  requireGM();
  return ChatMessage.create({
    speaker: { alias: "Найт-Сити" },
    content: `<article class="city-chat-encounter"><small>ГОРОДСКАЯ ВСТРЕЧА</small><h3>${cityEsc(result.title)}</h3><p>${cityEsc(result.publicText)}</p></article>`,
  });
}
export async function openWorldMapEncounterForge(result) {
  requireGM();
  const open = game.modules.get(MID)?.api?.forge?.open;
  if (!open) throw new Error("Кузница NPC недоступна.");
  return open({
    values: result.forgeValues,
    encounterContext: {
      title: result.title,
      districtName: result.districtName,
      faction: result.faction,
    },
  });
}
