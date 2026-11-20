import { normalizeForgeForm } from "./generator.mjs";
export function normalizeForgeEncounterContext(raw) {
  if (!raw) return null;
  return Object.fromEntries(
    ["title", "districtName", "faction"].map((k) => [
      k,
      String(raw[k] || "").slice(0, 250),
    ]),
  );
}
export async function applyForgeEncounterContext(
  app,
  { values, encounterContext },
  { readValues, applyValues, confirm },
) {
  if (!globalThis.game?.user?.isGM)
    throw new Error("Контекст Кузницы доступен только ведущему.");
  if (app.busy) throw new Error("Дождитесь завершения текущей сборки Кузницы.");
  const current = normalizeForgeForm(readValues(app));
  const baseline = normalizeForgeForm(
    app.cityEncounterBaseline ?? app.initialValues ?? current,
  );
  const dirty = JSON.stringify(current) !== JSON.stringify(baseline);
  if (values && dirty && !(await confirm())) return false;
  const next = normalizeForgeForm({ ...current, ...(values || {}) });
  if (values) {
    applyValues(app, next);
    app.cityEncounterBaseline = structuredClone(next);
  }
  app.encounterContext = normalizeForgeEncounterContext(encounterContext);
  return true;
}
