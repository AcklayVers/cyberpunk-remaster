import { createRuntimeId } from "./runtime-id.mjs";
import { createCityRefreshQueue } from "./city-refresh-queue.mjs";
import { UNIFIED_ARCHIVE_SECTIONS } from "./neuro-archive-store.mjs";
import {
  prepareCityAgentContext,
  agentDraftKey,
  cityAgentUnread,
  cityAgentMessageUnread,
  cityAgentSpeakerMode,
} from "./city-agent-view.mjs";
export { prepareCityAgentContext } from "./city-agent-view.mjs";
import {
  cityContacts,
  sendCityContactMessage,
  registerCityMessaging,
  syncCityMessagesInbox,
} from "./city-messaging.mjs";
import {
  mutateCityArchive,
  CITY_ARCHIVE_HOOK,
} from "./city-archive-service.mjs";
import {
  CITY_MID as MID,
  CITY_SERVICES_HOOK,
  cityValues,
  cityAuthor,
  registerCityServices,
} from "./city-services-state.mjs";
import {
  requestCityJobAcceptance,
  cityJobArchiveLink,
  listCityJobs,
  registerCityJobs,
  syncCityJobsInbox,
  resumeCityJobRequests,
  openCityJobInNetwork,
} from "./city-jobs.mjs";
import { grantCityMarketAccess, clearCityMarketCaches } from "./city-shops.mjs";
import {
  registerCityShopPurchases,
  resumeCityShopPurchases,
} from "./city-shop-purchases.mjs";
import {
  directoryRoot,
  ensureDirectoryLauncherGroup,
} from "./directory-launchers.mjs";
import { openWorldCityMap } from "./world-city-map-runtime.mjs";
import { getWorldMapActorPosition } from "./world-city-map-positions.mjs";
import { getCityCampaignTime } from "./city-calendar.mjs";
let instance = null,
  pending = null,
  AppClass = null,
  initialized = false;
let networkUnread = () => 0;
const error = (e) =>
  globalThis.ui?.notifications?.error?.(String(e.message || e));
export function cityAgentHotkeyAllowed(
  target = globalThis.document?.activeElement,
) {
  return (
    !target ||
    (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) &&
      !target.isContentEditable &&
      !target.closest?.('.ProseMirror,[contenteditable="true"]'))
  );
}
function actorsFor(ownerId) {
  const owner = game.users.get(ownerId);
  return cityValues(game.actors).filter(
    (a) =>
      a.type === "character" &&
      (owner?.isGM || a.testUserPermission?.(owner, "OWNER")),
  );
}
function pill() {
  let el = document.getElementById("city-agent-pill");
  if (!el) {
    el = document.createElement("button");
    el.id = "city-agent-pill";
    el.type = "button";
    el.addEventListener("click", () => void openCityAgent());
    document.body.append(el);
  }
  const unread = cityAgentUnread() + networkUnread(instance?.actorId);
  el.textContent = `АГЕНТ${unread ? ` · ${unread}` : ""}`;
}
function agentClass() {
  if (AppClass) return AppClass;
  const { ApplicationV2, HandlebarsApplicationMixin } =
    foundry.applications.api;
  AppClass = class extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: "cyberpunk-city-agent",
      tag: "section",
      classes: ["city-agent-application"],
      position: { width: 430, height: 760 },
      window: {
        title: "Агент · NCNET",
        icon: "fa-solid fa-mobile-screen",
        resizable: true,
        minimizable: true,
      },
    };
    static PARTS = {
      main: {
        template: `modules/${MID}/templates/city-agent.hbs`,
        scrollable: ["", ".agent-jobs", ".agent-messages", ".agent-profile"],
      },
    };
    constructor(options = {}) {
      let saved = {};
      try {
        saved = JSON.parse(
          localStorage.getItem(
            `${MID}.agent-window:${game.world.id}:${game.user.id}`,
          ) || "{}",
        );
      } catch {}
      super({
        ...options,
        ...(saved.position ? { position: saved.position } : {}),
      });
      this.ownerUserId = game.user.isGM
        ? options.ownerUserId || saved.ownerUserId || game.user.id
        : game.user.id;
      this.actorId =
        options.actorId ||
        saved.actorId ||
        game.user.character?.id ||
        actorsFor(this.ownerUserId)[0]?.id ||
        "";
      this.contactId = saved.contactId || "";
      this.speakerMode = saved.speakerMode === "actor" ? "actor" : "contact";
      this.tab = options.tab || saved.tab || "msg";
      this.drafts = {};
      this.draftRevisions = {};
      this.operations = {};
      this.sending = false;
      this.hooks = [];
      this.refreshQueue = createCityRefreshQueue(
        async () => {
          if (!this.rendered) return;
          const context = await this._prepareContext();
          if (this.rendered && context.agentRefreshKey !== this.lastRefreshKey)
            await this.render(true);
        },
        { onError: error },
      );
      try {
        this.drafts = JSON.parse(
          localStorage.getItem(
            `${MID}.agent-drafts:${game.world.id}:${game.user.id}`,
          ) || "{}",
        );
      } catch {}
    }
    render(...args) {
      this.captureDraft();
      return super.render(...args);
    }
    _preSyncPartState(partId, newElement, priorElement, state) {
      super._preSyncPartState(partId, newElement, priorElement, state);
      if (newElement.dataset.agentView !== priorElement.dataset.agentView) {
        state.focus = null;
        state.scrollPositions = [];
        state.details = {};
        return;
      }
      // Capture at replacement time: the user may scroll or type while a template loads.
      this.captureDraft();
      const priorDraft = priorElement.querySelector("[data-agent-draft]");
      const nextDraft = newElement.querySelector("[data-agent-draft]");
      if (
        priorDraft &&
        nextDraft?.dataset.agentDraftKey === priorDraft.dataset.agentDraftKey
      )
        nextDraft.value = priorDraft.value;
      if (priorDraft && priorDraft === priorElement.ownerDocument.activeElement)
        state.agentSelection = [
          priorDraft.selectionStart,
          priorDraft.selectionEnd,
          priorDraft.selectionDirection,
        ];
      const messages = priorElement.querySelector(".agent-messages");
      state.agentFollowMessages =
        !!messages &&
        messages.scrollHeight - messages.clientHeight - messages.scrollTop <= 3;
      state.agentOuterScroll =
        this.element.querySelector(".window-content")?.scrollTop;
    }
    _syncPartState(partId, newElement, priorElement, state) {
      super._syncPartState(partId, newElement, priorElement, state);
      const draft = newElement.querySelector("[data-agent-draft]");
      if (draft && state.agentSelection)
        draft.setSelectionRange(...state.agentSelection);
      const messages = newElement.querySelector(".agent-messages");
      if (messages && state.agentFollowMessages)
        messages.scrollTop = messages.scrollHeight;
      const outer = this.element.querySelector(".window-content");
      if (outer && state.agentOuterScroll !== undefined)
        outer.scrollTop = state.agentOuterScroll;
    }
    captureDraft() {
      const input = this.element?.querySelector("[data-agent-draft]");
      if (!input?.dataset.agentDraftKey) return;
      this.drafts[input.dataset.agentDraftKey] = input.value;
      this.saveDrafts();
    }
    async _prepareContext() {
      if (!game.user.isGM) this.ownerUserId = game.user.id;
      if (!actorsFor(this.ownerUserId).some((a) => a.id === this.actorId))
        this.actorId = actorsFor(this.ownerUserId)[0]?.id || "";
      const contacts = cityContacts(this);
      if (!this.contactId) this.contactId = contacts[0]?.id || "__network";
      if (
        this.contactId !== "__network" &&
        !contacts.some((c) => c.id === this.contactId)
      )
        this.contactId = "__network";
      return {
        ...prepareCityAgentContext(this),
        agentRefreshKey: prepareCityAgentContext({
          ...this,
          drafts: {},
          sending: false,
        }).agentRefreshKey,
      };
    }
    async _onRender(context, options) {
      await super._onRender?.(context, options);
      this.lastRefreshKey = context.agentRefreshKey;
      this.events?.abort();
      this.events = new AbortController();
      this.commLinkController?.destroy();
      this.commLinkController = null;
      this.element.classList.toggle(
        "city-agent-network",
        this.tab === "network",
      );
      if (this.tab === "network") {
        if (!this.phonePosition) {
          this.phonePosition = {
            width: this.position.width,
            height: this.position.height,
          };
          this.setPosition?.({
            width: Math.min(1200, globalThis.innerWidth - 35),
            height: Math.min(920, globalThis.innerHeight - 45),
          });
        }
        const { mountCityCommLink, cityCommLinkUnread } =
          await import("./city-comm-link-runtime.mjs");
        networkUnread = cityCommLinkUnread;
        this.commLinkController = await mountCityCommLink(
          this.element.querySelector("[data-agent-comm-link]"),
          {
            actorId: this.actorId,
            onActorChanged: (actorId) => {
              if (!actorsFor(this.ownerUserId).some((a) => a.id === actorId))
                return;
              this.captureDraft();
              this.actorId = actorId;
              this.contactId = "";
              const select = this.element?.querySelector("[data-agent-actor]");
              if (select) select.value = actorId;
            },
          },
        );
      } else if (this.phonePosition) {
        this.setPosition?.(this.phonePosition);
        this.phonePosition = null;
      }
      document.getElementById("city-agent-pill")?.remove();
      const signal = this.events.signal;
      this.element.addEventListener(
        "input",
        (e) => {
          if (e.target.matches("[data-agent-draft]")) {
            const key = e.target.dataset.agentDraftKey;
            if (!key) return;
            this.drafts[key] = e.target.value;
            this.draftRevisions[key] = (this.draftRevisions[key] || 0) + 1;
            this.saveDrafts();
          }
        },
        { signal },
      );
      this.element.addEventListener(
        "change",
        (e) => {
          if (
            !e.target.matches(
              "[data-agent-owner],[data-agent-actor],[data-agent-contact],[data-agent-speaker]",
            )
          )
            return;
          this.captureDraft();
          if (e.target.matches("[data-agent-owner]") && game.user.isGM) {
            this.ownerUserId = e.target.value;
            this.actorId = actorsFor(this.ownerUserId)[0]?.id || "";
            this.contactId = "";
          }
          if (e.target.matches("[data-agent-actor]")) {
            this.actorId = e.target.value;
            this.contactId = "";
          }
          if (e.target.matches("[data-agent-contact]"))
            this.contactId = e.target.value;
          if (e.target.matches("[data-agent-speaker]") && game.user.isGM)
            this.speakerMode = e.target.value === "actor" ? "actor" : "contact";
          void this.render(true);
        },
        { signal },
      );
      this.element.addEventListener(
        "click",
        (e) => {
          const b = e.target.closest("[data-agent-action]");
          if (b) void this.action(b).catch(error);
        },
        { signal },
      );
      this.element.addEventListener(
        "keydown",
        (e) => {
          if (
            e.target.matches("[data-agent-draft]") &&
            e.key === "Enter" &&
            !e.shiftKey
          ) {
            e.preventDefault();
            void this.send().catch(error);
          }
        },
        { signal },
      );
      if (!this.hooks.length)
        for (const name of [
          CITY_ARCHIVE_HOOK,
          CITY_SERVICES_HOOK,
          "updateUser",
          "updateActor",
          "deleteActor",
          "createChatMessage",
          "updateJournalEntry",
          "deleteJournalEntry",
          "cyberpunkRemasterCommLink",
        ])
          this.hooks.push([name, Hooks.on(name, () => this.refresh())]);
      if (!this.clockHook) {
        this.clockHook = Hooks.on("updateWorldTime", () => this.refreshClock());
        this.hooks.push(["updateWorldTime", this.clockHook]);
      }
      const messages = this.element.querySelector(".agent-messages");
      if (messages && this.renderedAgentView !== context.agentViewKey)
        messages.scrollTop = messages.scrollHeight;
      this.renderedAgentView = context.agentViewKey;
      const at = Math.max(
        0,
        ...cityValues(game.messages)
          .filter((d) => !d.whisper?.length || d.whisper.includes(game.user.id))
          .map((d) => Number(d.timestamp) || 0),
      );
      if (at > (Number(game.user.getFlag?.(MID, "cityAgentReadAt")) || 0))
        void game.user.setFlag(MID, "cityAgentReadAt", at).catch(error);
    }
    saveDrafts() {
      try {
        localStorage.setItem(
          `${MID}.agent-drafts:${game.world.id}:${game.user.id}`,
          JSON.stringify(this.drafts),
        );
      } catch {}
    }
    refresh() {
      if (this.tab === "network") {
        this.refreshClock();
        return;
      }
      this.refreshQueue.request();
    }
    refreshClock() {
      const clock = this.element?.querySelector("[data-agent-clock]");
      const time = getCityCampaignTime().time;
      if (clock && clock.textContent !== time) clock.textContent = time;
    }
    async send() {
      if (this.sending) return;
      this.captureDraft();
      const key = agentDraftKey(this),
        body = this.drafts[key] || "";
      const revision = this.draftRevisions[key] || 0;
      if (!body.trim()) return;
      this.sending = true;
      this.operations[key] ??= { body, id: createRuntimeId() };
      if (this.operations[key].body !== body)
        this.operations[key] = { body, id: createRuntimeId() };
      try {
        await sendCityContactMessage({
          ownerUserId: this.ownerUserId,
          actorId: this.actorId,
          contactId: this.contactId,
          body,
          operationId: this.operations[key].id,
          asContact: cityAgentSpeakerMode(this) === "contact",
        });
        const compose =
          agentDraftKey(this) === key
            ? this.element?.querySelector("[data-agent-draft]")
            : null;
        if (compose?.dataset.agentDraftKey === key)
          this.drafts[key] = compose.value;
        if (
          this.drafts[key] === body &&
          (this.draftRevisions[key] || 0) === revision
        ) {
          this.drafts[key] = "";
          if (compose?.value === body) compose.value = "";
        }
        delete this.operations[key];
        this.saveDrafts();
      } finally {
        this.sending = false;
        await this.render(true);
      }
    }
    async action(b) {
      const action = b.dataset.agentAction;
      if (action === "tab") {
        this.tab = b.dataset.tab;
        return this.render(true);
      }
      if (action === "send") return this.send();
      if (action === "map")
        return openWorldCityMap({ activeActorId: this.actorId });
      if (action === "set-me") {
        const map = await openWorldCityMap({ activeActorId: this.actorId });
        map.mapController?.beginActorPosition?.();
        return;
      }
      if (action === "show-me") {
        const map = await openWorldCityMap({ activeActorId: this.actorId });
        const pos = getWorldMapActorPosition(this.actorId);
        if (pos) map.mapController?.focusPoint?.(pos);
        return;
      }
      if (action === "archive") {
        const { openNeuroArchive } =
          await import("./neuro-archive-runtime.mjs");
        return openNeuroArchive();
      }
      if (action === "take") {
        await requestCityJobAcceptance({
          jobId: b.dataset.jobId,
          actorId: this.actorId,
        });
        ui.notifications?.info?.(
          "Запрос передан ведущему. Подтверждение появится в телефоне.",
        );
        return;
      }
      if (action === "job-map") {
        const job = listCityJobs().find((j) => j.id === b.dataset.jobId);
        return openWorldCityMap({
          activeActorId: this.actorId,
          focusMarkerId: job?.markerId,
        });
      }
      if (action === "job-network")
        return openCityJobInNetwork(b.dataset.jobId, { actorId: this.actorId });
      if (action === "job-archive") {
        const job = listCityJobs().find((j) => j.id === b.dataset.jobId),
          link = cityJobArchiveLink(job, this.actorId, this.ownerUserId);
        if (link) {
          const { openNeuroArchiveEntry } =
            await import("./neuro-archive-runtime.mjs");
          return openNeuroArchiveEntry(link);
        }
        ui.notifications?.info?.(
          "Запись появится в Архиве после подтверждения заказа.",
        );
        return;
      }
      if (action === "grant") {
        if (!game.user.isGM) return;
        const doc = game.messages.get(b.dataset.messageId),
          r = doc?.flags?.[MID]?.cityMarketRequest,
          u = cityAuthor(doc),
          actor = game.actors.get(r?.actorId);
        if (
          !u ||
          !actor ||
          (!u.isGM && !actor.testUserPermission?.(u, "OWNER"))
        )
          throw new Error("Запрос недоступен.");
        return grantCityMarketAccess({
          shopId: r.shopId,
          userId: u.id,
          allowed: true,
        });
      }
      if (action === "new-contact") {
        if (!this.actorId) throw new Error("Выбери персонажа.");
        const title = await foundry.applications.api.DialogV2.prompt({
          window: { title: "Новый контакт" },
          content:
            '<label>Имя<input name="title" value="Ведущий / фиксер"></label>',
          ok: {
            label: "Добавить",
            callback: (_e, b) => b.form.elements.title.value,
          },
        });
        if (!title) return;
        const id = createRuntimeId();
        await mutateCityArchive(this.ownerUserId, (s) => {
          const actor = game.actors.get(this.actorId);
          if (
            !actor ||
            (!game.user.isGM && !actor.testUserPermission?.(game.user, "OWNER"))
          )
            throw new Error("Нет прав на персонажа.");
          const book = ((s.notebooks ??= {})[this.actorId] ??= {
            actorId: this.actorId,
            actorName: actor.name,
            actorImg: actor.img,
            entries: Object.fromEntries(
              UNIFIED_ARCHIVE_SECTIONS.map((k) => [k, []]),
            ),
          });
          (book.entries.people ??= []).push({
            id,
            type: "people",
            title: String(title),
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        });
        this.contactId = id;
        return this.render(true);
      }
      if (action === "options") {
        ui.notifications?.info?.(
          "Настройки мира → Настройки модулей → Агент: открывать при входе / звук уведомлений.",
        );
      }
    }
    _onClose(options) {
      this.captureDraft();
      this.commLinkController?.destroy();
      this.commLinkController = null;
      try {
        localStorage.setItem(
          `${MID}.agent-window:${game.world.id}:${game.user.id}`,
          JSON.stringify({
            position: this.position,
            ownerUserId: this.ownerUserId,
            actorId: this.actorId,
            contactId: this.contactId,
            speakerMode: this.speakerMode,
            tab: this.tab,
          }),
        );
      } catch {}
      this.saveDrafts();
      this.refreshQueue.cancel();
      this.events?.abort();
      for (const [n, id] of this.hooks) Hooks.off(n, id);
      this.hooks = [];
      this.clockHook = null;
      if (instance === this) instance = null;
      return super._onClose?.(options);
    }
  };
  return AppClass;
}
export async function openCityAgent(options = {}) {
  await syncCityMessagesInbox();
  if (game.system?.id !== "sf2e")
    throw new Error("Агент работает в Starfinder2e.");
  if (pending) await pending;
  if (instance?.rendered) {
    let changed = false;
    for (const k of ["ownerUserId", "actorId", "tab"]) {
      if (options[k] !== undefined && instance[k] !== options[k]) {
        instance.captureDraft();
        instance[k] = options[k];
        changed = true;
        if (k !== "tab") instance.contactId = "";
      }
    }
    if (changed) await instance.render(true);
    instance.bringToFront();
    return instance;
  }
  instance = new (agentClass())(options);
  pending = instance.render(true);
  try {
    await pending;
  } catch (e) {
    instance = null;
    throw e;
  } finally {
    pending = null;
  }
  return instance;
}
export function initializeCityAgent() {
  if (initialized) return;
  initialized = true;
  registerCityServices();
  for (const [key, name, defaultValue] of [
    ["agentAutoOpen", "Агент: открывать при входе", false],
    ["agentNotifySound", "Агент: звук уведомлений", true],
  ])
    game.settings.register(MID, key, {
      name,
      scope: "client",
      config: true,
      type: Boolean,
      default: defaultValue,
    });
  game.keybindings?.register(MID, "agent", {
    name: "Агент · открыть телефон",
    editable: [{ key: "KeyA", modifiers: ["Shift"] }],
    onDown: () => {
      if (!cityAgentHotkeyAllowed()) return false;
      void openCityAgent().catch(error);
      return true;
    },
  });
  game.keybindings?.register(MID, "cityMap", {
    name: "Найт-Сити · открыть карту",
    editable: [{ key: "KeyM", modifiers: ["Shift"] }],
    onDown: () => {
      if (!cityAgentHotkeyAllowed()) return false;
      void openWorldCityMap();
      return true;
    },
  });
  registerCityMessaging();
  registerCityJobs();
  Hooks.on("cyberpunkRemasterCommLink", () => {
    if (document.getElementById("city-agent-pill")) pill();
  });
  const module = game.modules.get(MID);
  if (module) module.api = { ...module.api, agent: { open: openCityAgent } };
  globalThis.CyberpunkRemaster = {
    ...globalThis.CyberpunkRemaster,
    agent: openCityAgent,
  };
  Hooks.on("createChatMessage", (doc) => {
    if (instance?.rendered) return;
    if (cityAgentMessageUnread(doc)) {
      if (document.getElementById("city-agent-pill")) pill();
      ui.notifications?.info?.("АГЕНТ · Новое сообщение или городской запрос");
      if (game.settings.get(MID, "agentNotifySound"))
        void globalThis.foundry?.audio?.AudioHelper?.play?.(
          { src: "sounds/notify.wav", volume: 0.4 },
          false,
        );
    }
  });
}
globalThis.Hooks?.once?.("init", initializeCityAgent);
globalThis.Hooks?.once?.("ready", () => {
  // Purchase listeners inspect Users for GM authority, which is unavailable during init.
  registerCityShopPurchases();
  void import("./city-comm-link-runtime.mjs")
    .then((m) => {
      networkUnread = m.cityCommLinkUnread;
      return m.initializeCityCommLink();
    })
    .catch(error);
  void syncCityMessagesInbox().catch(error);
  void syncCityJobsInbox().catch(error);
  if (
    game.user.isGM &&
    (!game.users.activeGM || game.users.activeGM.id === game.user.id)
  ) {
    void clearCityMarketCaches().catch(error);
    void resumeCityJobRequests().catch(error);
    void resumeCityShopPurchases().catch(error);
    void import("./world-city-map-clock.mjs")
      .then((m) => m.initializeWorldMapClock())
      .catch(error);
  }
  if (game.settings.get(MID, "agentAutoOpen"))
    void openCityAgent().catch(error);
});
globalThis.Hooks?.on?.("renderActorDirectory", (app, html) => {
  const root = directoryRoot(app, html);
  if (!root || root.querySelector("[data-city-agent-launcher]")) return;
  const group = ensureDirectoryLauncherGroup(app, html);
  if (!group) return;
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.cityAgentLauncher = "true";
  b.innerHTML = '<i class="fa-solid fa-mobile-screen"></i> Агент';
  b.onclick = () => void openCityAgent().catch(error);
  group.append(b);
});
