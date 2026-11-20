// Adapted in spirit from the supplied Night City Map gig generator (Verlierboy).
export const CITY_GIG_TEMPLATES = [
  {
    title: "Тихая доставка",
    text: "Доставить защищённую посылку в {place}. Не вскрывать груз.",
    complication: "Получатель использует чужую личность.",
  },
  {
    title: "След пропавшего",
    text: "Найти человека, которого последний раз видели в {place}.",
    complication: "Пропавший сам скрывается от заказчика.",
  },
  {
    title: "Щепка с секретом",
    text: "Забрать носитель данных в {place} и передать фиксеру.",
    complication: "Копию данных ищет корпоративная служба безопасности.",
  },
  {
    title: "Ночная охрана",
    text: "Обеспечить безопасность встречи в {place}.",
    complication: "Одна из сторон приготовила засаду.",
  },
  {
    title: "Извлечение",
    text: "Вывести специалиста из {place} до смены караула.",
    complication: "Специалист отказывается уходить без напарника.",
  },
  {
    title: "Чужой долг",
    text: "Разобраться с пропавшим платежом в {place}.",
    complication: "Деньги ушли на лечение ребёнка.",
  },
  {
    title: "Плохая партия",
    text: "Проверить подозрительную поставку в {place}.",
    complication: "Поставка опасна для людей, но нужна влиятельному клиенту.",
  },
  {
    title: "Голос улиц",
    text: "Встретиться со свидетелем в {place} и получить показания.",
    complication: "За свидетелем уже ведётся наблюдение.",
  },
];
export function generateCityGig(
  markers,
  { seed = Date.now(), fixer = "Фиксер" } = {},
) {
  const visible = markers.filter(
    (m) => m.visible !== false && m.hidden !== true,
  );
  if (!visible.length)
    throw new Error("Сначала добавь доступные точки на карту.");
  let n = Number(seed) >>> 0;
  const rand = () =>
    (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
  const t = CITY_GIG_TEMPLATES[Math.floor(rand() * CITY_GIG_TEMPLATES.length)],
    p = visible[Math.floor(rand() * visible.length)];
  return {
    title: t.title,
    description: t.text.replace("{place}", p.title),
    gmText: t.complication,
    markerId: p.id,
    fixer,
    reward: "По договорённости",
    status: "offer",
  };
}
