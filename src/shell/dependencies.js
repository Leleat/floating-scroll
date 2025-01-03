/** ****************************************************************************
 *  Gi  ************************************************************************
 *******************************************************************************/

export { default as Atk } from "gi://Atk";
export { default as Clutter } from "gi://Clutter";
export { default as GLib } from "gi://GLib";
export { default as GObject } from "gi://GObject";
export { default as Gio } from "gi://Gio";
export { default as Graphene } from "gi://Graphene";
export { default as Meta } from "gi://Meta";
export { default as Mtk } from "gi://Mtk";
export { default as Shell } from "gi://Shell";
export { default as St } from "gi://St";

/** ****************************************************************************
 *  Shell  *********************************************************************
 ******************************************************************************/

export {
    Extension,
    gettext as _,
    InjectionManager,
    ngettext,
    pgettext as C_,
} from "resource:///org/gnome/shell/extensions/extension.js";

export * as AnimationUtils from "resource:///org/gnome/shell/misc/animationUtils.js";
export * as Params from "resource:///org/gnome/shell/misc/params.js";
export * as Signals from "resource:///org/gnome/shell/misc/signals.js";

export * as AltTab from "resource:///org/gnome/shell/ui/altTab.js";
export * as AppFavorites from "resource:///org/gnome/shell/ui/appFavorites.js";
export * as Background from "resource:///org/gnome/shell/ui/background.js";
export * as Layout from "resource:///org/gnome/shell/ui/layout.js";
export * as Main from "resource:///org/gnome/shell/ui/main.js";
export * as OsdWindow from "resource:///org/gnome/shell/ui/osdWindow.js";
export * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
export * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
export * as SwipeTracker from "resource:///org/gnome/shell/ui/swipeTracker.js";
export * as SwitcherPopup from "resource:///org/gnome/shell/ui/switcherPopup.js";
export * as WindowManager from "resource:///org/gnome/shell/ui/windowManager.js";
export * as WindowMenu from "resource:///org/gnome/shell/ui/windowMenu.js";
export * as WorkspaceAnimation from "resource:///org/gnome/shell/ui/workspaceAnimation.js";
