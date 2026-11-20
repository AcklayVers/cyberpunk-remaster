import test from "node:test";
import assert from "node:assert/strict";
import { cityTestEnv } from "./fixtures/city-services.mjs";
test("services panel exposes player browsing while all GM editors stay absent", async () => {
  cityTestEnv({ gm: false });
  const m = await import("../runtime/city-services-ui.mjs").catch(() => null);
  assert.ok(m, "city services panel must exist");
  for (const tab of ["jobs", "shops", "calendar", "npcs", "transfer"]) {
    const html = m.cityServicesHtml({
      tab,
      form: {},
      shops: [],
      jobs: [],
      items: [],
      actorId: "aa",
    });
    assert.doesNotMatch(
      html,
      /data-service-action="(?:job-create|shop-save|transfer-apply|calendar-setup|npc-import)"/,
    );
  }
});

test("services opens and preserves per-location drafts with ApplicationV2's read-only form", async () => {
  cityTestEnv();
  const listeners = new Map();
  class ApplicationV2 {
    constructor(options) {
      this.options = options;
      this.element = {
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(name, listener) {
          listeners.set(name, listener);
        },
      };
    }
    get form() {
      return null;
    }
    async render() {
      this.context = await this._prepareContext();
      await this._onRender(this.context, {});
      this.rendered = true;
      return this;
    }
    bringToFront() {}
    _onRender() {}
    _onClose() {
      this.rendered = false;
    }
    async close() {
      this._onClose({});
    }
  }
  globalThis.foundry = {
    applications: {
      api: { ApplicationV2, HandlebarsApplicationMixin: (Base) => Base },
    },
  };
  const { openCityServices } = await import("../runtime/city-services-ui.mjs");
  const app = await openCityServices({
    tab: "jobs",
    markerId: "bar",
    actorId: "aa",
  });
  assert.equal(
    app.form,
    null,
    "ApplicationV2's native form getter stays intact",
  );
  assert.match(app.context.bodyHtml, /Создать заказ/);
  listeners.get("input")({
    target: {
      dataset: { serviceField: "title" },
      value: "Не потерять черновик",
    },
  });
  await openCityServices({ tab: "shops", markerId: "clinic" });
  assert.match(app.context.bodyHtml, /Место торговли/);
  await openCityServices({ tab: "jobs", markerId: "bar" });
  assert.match(app.context.bodyHtml, /value="Не потерять черновик"/);
  await app.close();
});
