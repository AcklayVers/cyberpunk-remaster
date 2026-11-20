const LIBRARY = "cyberpunk-equipment-library";
const PACKS = ["implants", "weapons", "gear"];
const PHYSICAL_TYPES = new Set([
  "weapon",
  "ammo",
  "armor",
  "shield",
  "equipment",
  "consumable",
  "backpack",
  "treasure",
]);
const CREDIT_VALUES = { credits: 1, sp: 1, gp: 10, pp: 100, cp: 0.1 };
let itemsPromise;
let cachedPacks;

export function cityShopPhysicalItem(source) {
  return PHYSICAL_TYPES.has(source?.type);
}

export function cityShopImage(value = "") {
  const img = String(value).trim();
  if (
    img.length > 2048 ||
    /[\u0000-\u001f<>]/u.test(img) ||
    img.startsWith("//") ||
    (/^[a-z][a-z\d+.-]*:/iu.test(img) && !/^https?:\/\//iu.test(img))
  )
    throw new Error("Укажите безопасный путь или HTTP(S) URL изображения.");
  if (/^https?:/iu.test(img)) {
    try {
      const url = new URL(img);
      if (!url.hostname || url.username || url.password) throw new Error();
    } catch {
      throw new Error("Некорректный URL изображения.");
    }
  }
  return img;
}

export function cityShopPriceCredits(price, markup = 1) {
  const value = price?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.length) return null;
  let credits = 0;
  for (const [coin, amount] of entries) {
    if (
      !Object.hasOwn(CREDIT_VALUES, coin) ||
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount < 0
    )
      return null;
    credits += amount * CREDIT_VALUES[coin];
  }
  const total = credits * markup;
  const rounded = Math.ceil(total - Number.EPSILON * Math.abs(total));
  return Number.isSafeInteger(rounded) && rounded >= 0 ? rounded : null;
}

export function cityShopPackQuantity(price) {
  const per = price?.per ?? 1;
  return Number.isSafeInteger(per) && per > 0 ? per : 1;
}

function plainData(value, seen = new Set()) {
  if (
    value === null ||
    ["string", "boolean", "undefined"].includes(typeof value)
  )
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  if (
    !Array.isArray(value) &&
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return false;
  seen.add(value);
  const valid = Object.entries(value).every(
    ([key, child]) =>
      !["__proto__", "constructor", "prototype"].includes(key) &&
      plainData(child, seen),
  );
  seen.delete(value);
  return valid;
}

export function cityShopItemSource(document) {
  if (document?.documentName && document.documentName !== "Item")
    throw new Error("Выберите физический предмет Foundry Item.");
  const data =
    typeof document?.toObject === "function" ? document.toObject() : document;
  if (!data || !plainData(data) || !cityShopPhysicalItem(data))
    throw new Error("Выберите физический предмет с корректными данными.");
  const source = structuredClone(data);
  source.img = cityShopImage(source.img || "icons/svg/item-bag.svg");
  for (const key of [
    "_id",
    "id",
    "uuid",
    "folder",
    "ownership",
    "_stats",
    "pack",
    "parent",
  ])
    delete source[key];
  return source;
}

export function loadCityShopItems({ refresh = false } = {}) {
  if (!game.modules?.get(LIBRARY)?.active) {
    itemsPromise = null;
    return Promise.reject(
      new Error(
        "Cyberpunk Equipment Library должна быть установлена и активна. Собственные товары доступны без библиотеки.",
      ),
    );
  }
  if (refresh || cachedPacks !== game.packs) itemsPromise = null;
  cachedPacks = game.packs;
  if (!itemsPromise) {
    const pending = Promise.all(
      PACKS.map(async (name) => {
        const packId = `${LIBRARY}.${name}`;
        const pack = game.packs?.get(packId);
        if (
          !pack?.getDocuments ||
          (pack.documentName && pack.documentName !== "Item")
        )
          throw new Error(`Компендий Library ${name} недоступен.`);
        const documents = await pack.getDocuments();
        return documents.filter(cityShopPhysicalItem).map((document) => {
          const data =
            typeof document.toObject === "function"
              ? document.toObject()
              : document;
          return {
            ...structuredClone(data),
            uuid: `Compendium.${packId}.Item.${data._id || document.id}`,
          };
        });
      }),
    ).then((groups) => groups.flat());
    itemsPromise = pending;
    pending.catch(() => {
      if (itemsPromise === pending) itemsPromise = null;
    });
  }
  return itemsPromise.then((items) => structuredClone(items));
}
