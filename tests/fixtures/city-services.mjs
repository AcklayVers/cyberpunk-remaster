export function cityTestEnv({ gm = true } = {}) {
  const callbacks = new Map();
  let next = 0;
  globalThis.Hooks = {
    on(n, f) {
      callbacks.set(++next, { n, f });
      return next;
    },
    off(n, id) {
      callbacks.delete(id);
    },
    callAll(n, ...a) {
      for (const c of callbacks.values()) if (c.n === n) c.f(...a);
    },
  };
  const settings = new Map([
      ["worldCityMap", JSON.stringify({ version: 5, markers: [] })],
    ]),
    messages = new Map(),
    journals = new Map(),
    storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
  };
  function user(id, isGM) {
    return {
      id,
      name: id,
      isGM,
      active: true,
      flags: {},
      getFlag(s, k) {
        return this.flags[s]?.[k];
      },
      async setFlag(s, k, v) {
        (this.flags[s] ??= {})[k] = structuredClone(v);
        Hooks.callAll("updateUser", this);
      },
      async update(d) {
        for (const [k, v] of Object.entries(d)) {
          let o = this;
          const a = k.split(".");
          for (const p of a.slice(0, -1)) o = o[p] ??= {};
          o[a.at(-1)] = structuredClone(v);
        }
        Hooks.callAll("updateUser", this, d);
        return this;
      },
    };
  }
  const users = new Map([
    ["g", user("g", true)],
    ["a", user("a", false)],
    ["b", user("b", false)],
  ]);
  users.activeGM = users.get("g");
  const actor = (id, owner) => ({
    id,
    name: id,
    type: "character",
    img: "icons/svg/mystery-man.svg",
    ownership: { [owner]: 3 },
    testUserPermission: (u) => u.isGM || u.id === owner,
    getFlag(s, k) {
      return this.flags?.[s]?.[k];
    },
    async setFlag(s, k, v) {
      ((this.flags ??= {})[s] ??= {})[k] = v;
    },
    async createEmbeddedDocuments(t, docs) {
      return docs;
    },
  });
  globalThis.game = {
    user: users.get(gm ? "g" : "a"),
    users,
    world: { id: "qa" },
    actors: new Map([
      ["aa", actor("aa", "a")],
      ["bb", actor("bb", "b")],
    ]),
    messages,
    journal: journals,
    modules: new Map(),
    time: {
      worldTime: 100,
      async advance(s) {
        this.worldTime += s;
      },
    },
    settings: {
      get(s, k) {
        return settings.get(k);
      },
      async set(s, k, v) {
        settings.set(k, structuredClone(v));
        Hooks.callAll("cyberpunkRemasterWorldCityMap", v);
        return v;
      },
      register(s, k, c) {
        if (!settings.has(k)) settings.set(k, c.default);
      },
    },
  };
  globalThis.ChatMessage = {
    getSpeaker: ({ actor }) => ({ actor: actor?.id }),
    async create(d) {
      const doc = {
        ...structuredClone(d),
        id: `m${messages.size}`,
        author: game.user,
        user: game.user,
        getFlag(s, k) {
          return this.flags?.[s]?.[k];
        },
      };
      messages.set(doc.id, doc);
      Hooks.callAll("createChatMessage", doc);
      return doc;
    },
  };
  globalThis.JournalEntry = {
    async create(d) {
      const doc = {
        ...structuredClone(d),
        id: `j${journals.size}`,
        _stats: { lastModifiedBy: game.user.id },
        getFlag(s, k) {
          return this.flags?.[s]?.[k];
        },
        async update(d) {
          Object.assign(this, structuredClone(d));
          this._stats = { ...this._stats, lastModifiedBy: game.user.id };
          return this;
        },
      };
      journals.set(doc.id, doc);
      return doc;
    },
  };
  return { users, messages, journals, settings, storage, callbacks };
}
export const cityArchive = (contactActorId = "bb") => ({
  version: 3,
  activeActorId: "aa",
  notebooks: {
    aa: {
      actorId: "aa",
      actorName: "aa",
      entries: {
        people: [
          {
            id: "c",
            type: "people",
            title: "Contact",
            sourceActorId: contactActorId,
            messages: [],
          },
        ],
        quests: [],
        notes: [{ id: "n", type: "notes", title: "Draft", content: "Unsaved" }],
      },
    },
  },
});
