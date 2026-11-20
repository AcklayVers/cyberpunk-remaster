const pageScrollers = [
  ".cl-master-body main",
  ".cl-master-nav",
  ".cl-phone-screen main",
  ".cl-login-content",
];
const nestedScrollers = [
  ".cl-modal-body",
  ".cl-import-list",
  ".cl-chat-log",
  ".cl-call-transcript",
  ".cl-actor-grid",
  ".cl-dial-grid",
];

export function commLinkViewKeys(state) {
  const page = JSON.stringify([
    state.mode,
    state.runnerActorId,
    state.previewGroupId,
    state.activeGroupId,
    state.runnerSimulation,
    state.mode === "login" ? state.loginTarget : null,
    state.mode === "master" ? state.masterTab : state.runnerTab,
  ]);
  const modal = state.modal;
  return {
    page,
    modal: modal
      ? JSON.stringify([
          page,
          modal.type,
          modal.id,
          modal.groupId,
          modal.threadId,
          modal.contactId,
          modal.actorId,
        ])
      : null,
  };
}

export function captureCommLinkView(root, previous, next) {
  const samePage = previous?.page === next.page;
  const sameModal = !!next.modal && previous?.modal === next.modal;
  const selectors = [...pageScrollers, ...nestedScrollers];
  const scroll = selectors.flatMap((selector) =>
    [...root.querySelectorAll(selector)].flatMap((element, index) => {
      const sameContext = element.closest?.(".cl-modal") ? sameModal : samePage;
      return sameContext
        ? [
            {
              selector,
              index,
              top: element.scrollTop,
              left: element.scrollLeft,
              follow:
                element.matches(".cl-chat-log,.cl-call-transcript") &&
                element.scrollHeight -
                  element.clientHeight -
                  element.scrollTop <=
                  3,
            },
          ]
        : [];
    }),
  );
  const active = root.ownerDocument.activeElement;
  const inModal = active?.closest?.(".cl-modal");
  let focus = null;
  if (
    root.contains(active) &&
    active.matches("[data-bind]") &&
    (inModal ? sameModal : samePage)
  ) {
    const bind = active.dataset.bind;
    focus = {
      bind,
      index: [...root.querySelectorAll("[data-bind]")]
        .filter((element) => element.dataset.bind === bind)
        .indexOf(active),
      start: active.selectionStart,
      end: active.selectionEnd,
      direction: active.selectionDirection,
    };
  }
  return { scroll, focus };
}

export function restoreCommLinkView(root, state) {
  if (state.focus) {
    const focus = [...root.querySelectorAll("[data-bind]")].filter(
      (element) => element.dataset.bind === state.focus.bind,
    )[state.focus.index];
    focus?.focus({ preventScroll: true });
    if (focus && state.focus.start !== null)
      focus.setSelectionRange?.(
        state.focus.start,
        state.focus.end,
        state.focus.direction,
      );
  }
  for (const position of state.scroll) {
    const element = root.querySelectorAll(position.selector)[position.index];
    if (element) {
      element.scrollTop = position.follow ? element.scrollHeight : position.top;
      element.scrollLeft = position.left;
    }
  }
}
