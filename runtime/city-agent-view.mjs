import { cityEsc as esc } from "./world-city-map-media.mjs";
import { readCityArchive } from "./city-archive-service.mjs";
import {
  cityContacts,
  cityThread,
  cityContactPayload,
  cityMessageAuthenticated,
} from "./city-messaging.mjs";
import { listCityJobs } from "./city-jobs.mjs";
import { getCityCampaignTime } from "./city-calendar.mjs";
import { getWorldCityMap } from "./world-city-map.mjs";
import { getWorldMapActorPosition } from "./world-city-map-positions.mjs";
import {
  cityValues,
  cityAuthor,
  CITY_MID as MID,
} from "./city-services-state.mjs";
export const cityAgentSpeakerMode = (s) =>
  game.user.isGM &&
  (s.ownerUserId !== game.user.id || s.speakerMode !== "actor")
    ? "contact"
    : "actor";
export const agentDraftKey = (s) =>
  `${s.ownerUserId}:${s.actorId}:${s.contactId}${cityAgentSpeakerMode(s) === "contact" ? ":contact" : ""}`;
export function cityAgentInbox() {
  return cityValues(game.messages)
    .filter((d) => {
      if (
        d.whisper?.length &&
        !d.whisper.includes(game.user.id) &&
        !game.user.isGM
      )
        return false;
      const f = d.flags?.[MID] || {};
      return f.cityJobOffer || f.cityJobResult || f.cityMarketInvitation
        ? cityAuthor(d)?.isGM
        : !!f.cityMarketRequest || !!f.cityJobRequest;
    })
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}
export function cityAgentMessageUnread(d) {
  const at = Number(game.user.getFlag?.(MID, "cityAgentReadAt")) || 0;
  if (!d) return false;
  if (cityAuthor(d)?.id === game.user.id) return false;
  if (d.whisper?.length && !d.whisper.includes(game.user.id)) return false;
  const p = cityContactPayload(d),
    f = d.flags?.[MID] || {};
  if (
    !(p && cityMessageAuthenticated(d)) &&
    !(
      (f.cityJobOffer || f.cityJobResult || f.cityMarketInvitation) &&
      cityAuthor(d)?.isGM
    ) &&
    !f.cityMarketRequest &&
    !f.cityJobRequest
  )
    return false;
  return (d.timestamp || Date.parse(p?.createdAt) || 0) > at;
}
export function cityAgentUnread() {
  return cityValues(game.messages).filter(cityAgentMessageUnread).length;
}
export function prepareCityAgentContext(s) {
  const contacts = cityContacts(s),
    contact = contacts.find((c) => c.id === s.contactId) || null,
    clock = getCityCampaignTime();
  const owners = game.user.isGM
    ? `<label>Архив<select name="agent-owner" data-agent-owner>${cityValues(
        game.users,
      )
        .map(
          (u) =>
            `<option value="${esc(u.id)}" ${u.id === s.ownerUserId ? "selected" : ""}>${esc(u.name)}</option>`,
        )
        .join("")}</select></label>`
    : "";
  const owner = game.users.get(s.ownerUserId),
    actors = cityValues(game.actors).filter(
      (a) =>
        a.type === "character" &&
        (owner?.isGM || a.testUserPermission?.(owner, "OWNER")),
    );
  const actorSelect = `<label>Персонаж<select name="agent-actor" data-agent-actor><option value="">Выбрать…</option>${actors.map((a) => `<option value="${esc(a.id)}" ${a.id === s.actorId ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>`;
  const button = (action, label, attrs = "") =>
    `<button type="button" data-agent-action="${action}" ${attrs}>${label}</button>`;
  let body = "";
  if (s.tab === "msg") {
    const actorName = game.actors.get(s.actorId)?.name || "Персонаж";
    const nav = `<p class="agent-contact-context">${esc(s.ownerUserId === game.user.id ? "Мои контакты" : `Контакты Архива ${owner?.name || ""}`)} · ${esc(actorName)}</p><div class="agent-contacts"><select name="agent-contact" data-agent-contact aria-label="Кому: контакт"><option value="__network" ${s.contactId === "__network" ? "selected" : ""}>NCNET · уведомления и запросы</option>${contacts.map((c) => `<option value="${esc(c.id)}" ${s.contactId === c.id ? "selected" : ""}>${esc(c.title)}${c.contactSource === "network" ? ` · Сеть ${esc(c.commLinkGroupName || "")}` : c.contactSource === "master" ? " · GM адресная книга" : ""}</option>`).join("")}</select>${button("new-contact", "+", 'title="Добавить контакт"')}</div>`;
    if (contact) {
      const rows = cityThread(s);
      const speakerMode = cityAgentSpeakerMode(s);
      const speaker = game.user.isGM
        ? s.ownerUserId === game.user.id
          ? `<label>Отправитель<select name="agent-speaker" data-agent-speaker><option value="contact" ${speakerMode === "contact" ? "selected" : ""}>Контакт · ${esc(contact.title)}</option><option value="actor" ${speakerMode === "actor" ? "selected" : ""}>Персонаж · ${esc(actorName)}</option></select></label>`
          : "<small>Ответ от имени контакта</small>"
        : "";
      const direction =
        speakerMode === "contact"
          ? `${contact.title} → ${actorName}`
          : `${actorName} → ${contact.title}`;
      body =
        nav +
        `<div class="agent-speaker">${speaker}<p data-agent-direction>${esc(direction)}</p></div><div class="agent-messages">${rows.map((m) => `<article class="agent-message ${m.direction === "out" ? "out" : "in"}"><header><b>${esc(m.sourceActorName || (m.direction === "out" ? actorName : contact.title))}</b><time>${esc(new Date(m.createdAt || 0).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }))}</time></header><p>${esc(m.body || m.text || "")}</p></article>`).join("") || '<p class="agent-empty">Канал молчит. Напиши первое сообщение.</p>'}</div><div class="agent-compose"><textarea name="agent-draft" data-agent-draft data-agent-draft-key="${esc(agentDraftKey(s))}" rows="3" placeholder="Сообщение…">${esc(s.drafts[agentDraftKey(s)] || "")}</textarea>${button("send", "Отправить", s.sending ? "disabled" : "")}</div>`;
    } else {
      body =
        nav +
        `<div class="agent-messages">${
          cityAgentInbox()
            .map((d) => {
              const f = d.flags[MID] || {},
                r = f.cityMarketRequest,
                j = f.cityJobResult,
                o = f.cityJobOffer,
                i = f.cityMarketInvitation;
              return `<article class="agent-message"><b>${esc(cityAuthor(d)?.name || "NCNET")}</b><p>${esc(r ? "Запрос приглашения на Ночной рынок" : j ? `Заказ «${j.job.title}»: ${j.job.status}` : o ? `Предложение: ${o.title}` : i ? `${i.allowed ? "Приглашение получено" : "Приглашение отозвано"}: ${i.name}` : "Запрос принятия заказа")}</p>${game.user.isGM && r ? button("grant", "Выдать приглашение", `data-message-id="${esc(d.id)}"`) : ""}</article>`;
            })
            .join("") ||
          '<p class="agent-empty">Новых уведомлений нет. Выбери контакт или добавь связь с ведущим.</p>'
        }</div>`;
    }
  } else if (s.tab === "network")
    body =
      '<section class="agent-comm-link-host" data-agent-comm-link aria-label="Сеть COMM-LINK"></section>';
  else if (s.tab === "jobs")
    body = `<div class="agent-jobs">${
      listCityJobs({ actorId: s.actorId })
        .map(
          (j) =>
            `<article class="agent-job"><header><b>${esc(j.title)}</b><span>${esc({ hidden: "Черновик", offer: "Предложение", active: "Принято", done: "Выполнено", failed: "Провалено", cancelled: "Отменено", declined: "Отклонено" }[j.status] || j.status)}</span></header><small>${esc(j.fixer || "Фиксер")}${j.commLinkGroupName ? ` · ${esc(j.commLinkGroupName)}` : ""}</small><p>${esc(j.description)}</p><strong>${esc(j.reward || "По договорённости")}</strong><div>${j.status === "offer" ? button("take", "Принять", `data-job-id="${esc(j.id)}"`) : ""}${j.markerId ? button("job-map", "На карте", `data-job-id="${esc(j.id)}"`) : ""}${j.commLinkGroupId ? button("job-network", "В Сети", `data-job-id="${esc(j.id)}"`) : ""}${button("job-archive", "В Архив", `data-job-id="${esc(j.id)}"`)}</div></article>`,
        )
        .join("") || '<p class="agent-empty">Доступных заказов пока нет.</p>'
    }</div>`;
  else {
    const actor = game.actors.get(s.actorId),
      pos = actor ? getWorldMapActorPosition(actor.id) : null,
      party = getWorldCityMap().partyPosition,
      book = readCityArchive(s.ownerUserId).notebooks?.[s.actorId];
    body = `<div class="agent-profile"><img src="${esc(actor?.img || "icons/svg/mystery-man.svg")}" alt=""><h2>${esc(actor?.name || "Выбери персонажа")}</h2><p>${esc(book?.goal || "Твой канал в сети Найт-Сити")}</p><p>Моя позиция: ${pos ? "отмечена" : "не задана"}</p><p>Группа: ${party && (game.user.isGM || party.visible) ? "позиция доступна" : "позиция не показана"}</p>${button("set-me", "Я здесь")}${button("show-me", "Показать мою позицию")}${button("archive", "Открыть Архив")}${button("options", "Настройки телефона")}</div>`;
  }
  return {
    agentRefreshKey: JSON.stringify([
      s.tab,
      s.ownerUserId,
      s.actorId,
      owners,
      actorSelect,
      body,
    ]),
    agentViewKey: JSON.stringify([
      s.tab,
      s.ownerUserId,
      s.actorId,
      s.tab === "msg" ? s.contactId : null,
    ]),
    contacts,
    contact,
    bodyHtml: `<header class="agent-status"><time data-agent-clock>${esc(clock.time)}</time><span>NCNET ▮▮▮▯</span></header><div class="agent-context">${owners}${actorSelect}</div><main class="agent-body">${body}</main><nav class="agent-nav">${["msg", "jobs", "network", "me"].map((tab, i) => button("tab", ["Чаты", "Заказы", "Сеть", "Я"][i], `data-tab="${tab}" class="${s.tab === tab ? "active" : ""}"`)).join("")}${button("map", "Карта")}</nav>`,
  };
}
