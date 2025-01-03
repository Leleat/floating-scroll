/** ****************************************************************************
 *  Gi  ************************************************************************
 *******************************************************************************/

export { default as Adw } from "gi://Adw";
export { default as Gdk } from "gi://Gdk";
export { default as Gio } from "gi://Gio";
export { default as GLib } from "gi://GLib";
export { default as GObject } from "gi://GObject";
export { default as Gtk } from "gi://Gtk";
export { default as Pango } from "gi://Pango";

/** ****************************************************************************
 *  Prefs  *********************************************************************
 *******************************************************************************/

export {
    ExtensionPreferences,
    gettext as _,
    ngettext,
    pgettext as C_,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
