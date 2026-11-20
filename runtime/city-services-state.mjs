export const CITY_SERVICES_HOOK = "cyberpunkRemasterCityServices";
export const CITY_MID = "cyberpunk-remaster";
let queue = Promise.resolve();
export const cityValues = (c) => Array.from(c?.values?.() || c || []);
export function requireCityGM() {
  if (!game.user?.isGM) throw new Error("Это действие доступно ведущему.");
  if (game.users.activeGM && game.users.activeGM.id !== game.user.id)
    throw new Error("Это действие выполняет активный ведущий Foundry.");
}
export function cityServices() {
  let v = game.settings.get(CITY_MID, "cityServicesV1");
  try {
    if (typeof v === "string") v = JSON.parse(v);
  } catch {
    v = null;
  }
  return { version: 1, jobs: [], shops: [], ...structuredClone(v || {}) };
}
export function updateCityServices(mutator) {
  const next = queue
    .catch(() => {})
    .then(async () => {
      requireCityGM();
      const s = cityServices();
      await mutator(s);
      await game.settings.set(CITY_MID, "cityServicesV1", JSON.stringify(s));
      Hooks.callAll(CITY_SERVICES_HOOK);
      return s;
    });
  queue = next;
  return next;
}
export function registerCityServices() {
  game.settings.register(CITY_MID, "cityServicesV1", {
    scope: "world",
    config: false,
    type: String,
    default: '{"version":1,"jobs":[],"shops":[]}',
    onChange: () => Hooks.callAll(CITY_SERVICES_HOOK),
  });
}
export function cityAuthor(doc) {
  return typeof doc?.author === "object"
    ? doc.author
    : game.users.get(doc?.author || doc?.user?.id || doc?.user);
}
export function cityPrivateDocuments(key) {
  return cityValues(game.journal).filter((j) => j.flags?.[CITY_MID]?.[key]);
}
export async function cityPrivateJournal(name, key, value) {
  requireCityGM();
  return JournalEntry.create({
    name,
    ownership: { default: 0 },
    pages: [],
    flags: { [CITY_MID]: { [key]: structuredClone(value) } },
  });
}
export async function cityWritePrivate(doc, key, value) {
  requireCityGM();
  await doc.update({
    flags: {
      ...doc.flags,
      [CITY_MID]: {
        ...(doc.flags?.[CITY_MID] || {}),
        [key]: structuredClone(value),
      },
    },
  });
}
