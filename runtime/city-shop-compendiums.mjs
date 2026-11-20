import { requireCityGM, cityValues } from "./city-services-state.mjs";
import {
  cityShopPhysicalItem,
  cityShopItemSource,
  cityShopPriceCredits,
  cityShopPackQuantity,
} from "./city-shop-catalog.mjs";

const isItemPack = (pack) =>
  (pack?.documentName || pack?.metadata?.type) === "Item";
function itemPack(id) {
  requireCityGM();
  const pack = game.packs?.get(id);
  if (!isItemPack(pack)) throw new Error("Выберите доступный Item-компендий.");
  return pack;
}
export function listCityShopCompendiums() {
  requireCityGM();
  return cityValues(game.packs)
    .filter(isItemPack)
    .map((pack) => ({
      id:
        pack.collection ||
        `${pack.metadata?.packageName}.${pack.metadata?.name}`,
      name:
        pack.metadata?.label || pack.title || pack.collection || "Компендий",
    }))
    .filter((pack) => pack.id && pack.id !== "undefined.undefined")
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
export function cityShopCompendiumOffer(uuid, source) {
  return {
    id: uuid,
    uuid,
    name: source.name,
    type: source.type,
    img: source.img,
    level: Number(source.system?.level?.value || 0),
    description: String(source.system?.description?.value || ""),
    basePrice: structuredClone(source.system?.price || { value: {} }),
    priceCredits: cityShopPriceCredits(source.system?.price),
    quantityPerPurchase: cityShopPackQuantity(source.system?.price),
  };
}
export async function loadCityShopCompendium(packId) {
  const pack = itemPack(packId),
    documents = await pack.getDocuments();
  requireCityGM();
  return documents.filter(cityShopPhysicalItem).flatMap((document) => {
    try {
      const source = cityShopItemSource(document),
        id = document.id || document._id;
      return id
        ? [cityShopCompendiumOffer(`Compendium.${packId}.Item.${id}`, source)]
        : [];
    } catch {
      return [];
    }
  });
}
export async function resolveCityShopCompendiumItem(uuid) {
  const match = /^Compendium\.(.+)\.Item\.([A-Za-z0-9_-]+)$/.exec(String(uuid));
  if (!match) throw new Error("Выберите предмет из Item-компендия.");
  const pack = itemPack(match[1]),
    document = await pack.getDocument(match[2]);
  requireCityGM();
  if (!document) throw new Error("Предмет компендия удалён или недоступен.");
  return {
    ...cityShopCompendiumOffer(uuid, cityShopItemSource(document)),
    source: cityShopItemSource(document),
  };
}
