import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWorldCityMap,
  createWorldMapPointsExport,
} from "../runtime/world-city-map.mjs";
async function load() {
  const m = await import("../runtime/world-city-map-dossier.mjs").catch(
    () => null,
  );
  assert.ok(m, "dossier module must exist");
  return m;
}
test("overlapping regions appear and private records never enter public payload", async () => {
  const m = await load();
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const dossier = m.getWorldMapDossier({
    marker: {
      id: "m",
      title: "Bar",
      description: "Public",
      x: 0.5,
      y: 0.5,
      categoryId: "bar",
      links: [],
    },
    state: {
      categories: [],
      regions: [
        { id: "r1", name: "One", points },
        { id: "r2", name: "Two", points },
      ],
    },
    archiveRecords: [{ title: "SECRET" }],
  });
  assert.equal(dossier.regions.length, 2);
  assert.doesNotMatch(
    JSON.stringify(
      m.publicWorldMapDossierPayload({
        ...dossier,
        archiveRecords: [{ title: "SECRET" }],
      }),
    ),
    /SECRET|archiveRecords/,
  );
});
test("galley survives point export and caption is escaped in HTML", async () => {
  const m = await load();
  const marker = {
    id: "m",
    media: {
      mode: "custom",
      gallery: [
        { id: "x", path: "worlds/x.webp", caption: "<script>oops</script>" },
      ],
    },
  };
  const state = normalizeWorldCityMap({ markers: [marker] });
  assert.equal(
    createWorldMapPointsExport(state).markers[0].media.gallery[0].path,
    "worlds/x.webp",
  );
  const d = m.getWorldMapDossier({
    marker: state.markers[0],
    state,
    archiveRecords: [],
  });
  assert.doesNotMatch(m.worldMapDossierHtml(d), /<script>/);
});

test("dossier accepts the inspector's personal links and selected owner records without publishing them", async () => {
  const m = await load();
  const link = {
    actorId: "a",
    section: "notes",
    entryId: "n",
    ownerUserId: "other",
  };
  const dossier = m.getWorldMapDossier({
    marker: { id: "m", links: [] },
    state: {},
    links: [link],
    archiveRecords: [{ ...link, title: "Private title" }],
  });
  assert.equal(dossier.archiveLinks.length, 1);
  assert.equal(dossier.archiveLinks[0].record.title, "Private title");
  assert.doesNotMatch(
    JSON.stringify(m.publicWorldMapDossierPayload(dossier)),
    /Private title|archiveLinks|other/,
  );
});
