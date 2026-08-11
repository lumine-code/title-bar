/**
 * The submenu-opening behaviour shared by the three things that hold menu
 * items: a `MenuLabel`, a `MenuItem` with children of its own, and a
 * `ContextMenu`. Each calls in from its own method rather than having one
 * mixed in, so every call site stays greppable.
 *
 * A caller must expose `submenu` or `items`, whose entries answer
 * `setSelected`, `setOpen`, `hasSubmenu` and `isOpen`. `positionSubmenu(target)`
 * is optional -- it is what `ContextMenu` uses to place a portaled submenu.
 */

const SUBMENU_DELAY = 100;

function initSubmenuParent(instance) {
  instance.submenuTimer = null;
  instance.submenuTimerTarget = null;
}

function getItems(instance) {
  return instance.submenu || instance.items;
}

function clearTimer(instance) {
  if (instance.submenuTimer) {
    clearTimeout(instance.submenuTimer);
    instance.submenuTimer = null;
    instance.submenuTimerTarget = null;
  }
}

// Opening is delayed so that crossing an item on the way somewhere else does
// not open it. Sibling submenus close when this one finally opens rather than
// when the pointer arrives, so a diagonal move towards an already-open submenu
// does not close it out from under the pointer.
function scheduleSubmenu(instance, target) {
  instance.submenuTimerTarget = target;
  instance.submenuTimer = setTimeout(() => {
    getItems(instance)?.forEach((o) => {
      if (o !== target) {
        o.setOpen(false);
      }
    });

    if (target.hasSubmenu()) {
      target.setOpen(true);
      instance.positionSubmenu?.(target);
    }

    instance.submenuTimer = null;
    instance.submenuTimerTarget = null;
  }, SUBMENU_DELAY);
}

function onChildMouseEnter(instance, target) {
  clearTimer(instance);

  getItems(instance)?.forEach((o) => {
    if (o !== target) {
      o.setSelected(false);
    }
  });

  if (target.isEnabled?.() ?? true) {
    target.setSelected(true);
    scheduleSubmenu(instance, target);
  }
}

// Moving within the item that already has a timer pending restarts it, so the
// submenu opens once the pointer settles rather than while it is still moving.
function onChildMouseMove(instance, target) {
  if (instance.submenuTimer && instance.submenuTimerTarget === target) {
    clearTimeout(instance.submenuTimer);
    scheduleSubmenu(instance, target);
  }
}

// Drops the highlight from every item, leaving open submenus open.
function clearFocus(instance) {
  clearTimer(instance);

  getItems(instance)?.forEach((o) => {
    if (!o.isOpen()) {
      o.setSelected(false);
    }
  });
}

function moveNestedSubmenusToPortal(parentItem, portalContainer) {
  if (!parentItem.hasSubmenu() || !portalContainer) return;

  parentItem.getSubmenu().forEach((item) => {
    if (item.hasSubmenu()) {
      item.setPortalContainer?.(portalContainer);
      moveNestedSubmenusToPortal(item, portalContainer);
    }
  });
}

module.exports = {
  initSubmenuParent,
  onChildMouseEnter,
  onChildMouseMove,
  clearFocus,
  moveNestedSubmenusToPortal,
};
