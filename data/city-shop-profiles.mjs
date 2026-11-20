export const CITY_SHOP_PROFILES = {
  weapon: {
    name: "Оружие и боеприпасы",
    types: ["weapon", "ammo", "consumable"],
  },
  armor: { name: "Броня и защита", types: ["armor", "shield"] },
  chrome: {
    name: "Хром и рипперы",
    types: ["equipment", "weapon", "armor", "shield", "consumable"],
    chrome: true,
  },
  medicine: {
    name: "Медицина",
    types: ["consumable", "equipment"],
    words: "мед|леч|аптеч|medical|heal|травм",
  },
  tech: {
    name: "Техника и программы",
    types: ["equipment", "consumable", "backpack"],
    words: "программ|дека|кибердек|инструмент|агент|tool|компьютер|scanner",
  },
  clothing: {
    name: "Одежда",
    types: ["equipment", "armor"],
    words: "одежд|костюм|куртк|плащ|ботин|брон|suit",
  },
  general: {
    name: "Смешанный ассортимент",
    types: [
      "weapon",
      "ammo",
      "armor",
      "shield",
      "equipment",
      "consumable",
      "backpack",
      "treasure",
    ],
  },
};
