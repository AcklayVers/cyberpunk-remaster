// Calendar names and holiday text adapted from Verlierboy's supplied Night City Map.
export const CITY_CALENDAR_HOLIDAYS = [
  {
    m: 1,
    d: 1,
    title: "Новый год",
    text: "Неон, фейерверки и вечеринки на улицах Найт-Сити.",
  },
  {
    m: 7,
    d: 4,
    title: "День независимости",
    text: "Праздник старых США и повод для городской вечеринки.",
  },
  {
    m: 10,
    d: 31,
    title: "Хэллоуин",
    text: "Маски, импланты-светильники и ночные заказы.",
  },
  {
    m: 12,
    d: 25,
    title: "Рождество",
    text: "Распродажи, голографические ёлки и переполненные моллы.",
  },
];
export function buildCityCalendar(base, date) {
  const c = structuredClone(base);
  c.name = "Найт-Сити 2045";
  c.currentDate = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate() - 1,
    seconds: date.getUTCHours() * 3600 + date.getUTCMinutes() * 60,
  };
  const names = [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ];
  if (Array.isArray(c.months))
    c.months = c.months.map((m, i) => ({ ...m, name: names[i] || m.name }));
  c.general = {
    ...c.general,
    gameWorldTimeIntegration: "mixed",
    showClock: true,
    pf2eSync: false,
  };
  return c;
}
