import { ExtensionPreferences, Gdk, type Gio, Gtk } from "./dependencies.js";

export function getSettings(): Gio.Settings {
    return ExtensionPreferences.lookupByUUID(
        "floating-scroll@extensions.leleat",
    )!.getSettings();
}

/**
 * Copy-pasta from https://gitlab.com/rmnvgr/nightthemeswitcher-gnome-shell-extension/-/blob/main/src/utils.js
 */
export function isValidShortcut({
    keycode,
    keyval,
    mask,
}: {
    keycode: number;
    keyval: number;
    mask: Gdk.ModifierType;
}) {
    if ((mask === 0 || mask === Gdk.ModifierType.SHIFT_MASK) && keycode !== 0) {
        if (
            (keyval >= Gdk.KEY_a && keyval <= Gdk.KEY_z) ||
            (keyval >= Gdk.KEY_A && keyval <= Gdk.KEY_Z) ||
            (keyval >= Gdk.KEY_0 && keyval <= Gdk.KEY_9) ||
            (keyval >= Gdk.KEY_kana_fullstop &&
                keyval <= Gdk.KEY_semivoicedsound) ||
            (keyval >= Gdk.KEY_Arabic_comma &&
                keyval <= Gdk.KEY_Arabic_sukun) ||
            (keyval >= Gdk.KEY_Serbian_dje &&
                keyval <= Gdk.KEY_Cyrillic_HARDSIGN) ||
            (keyval >= Gdk.KEY_Greek_ALPHAaccent &&
                keyval <= Gdk.KEY_Greek_omega) ||
            (keyval >= Gdk.KEY_hebrew_doublelowline &&
                keyval <= Gdk.KEY_hebrew_taf) ||
            (keyval >= Gdk.KEY_Thai_kokai && keyval <= Gdk.KEY_Thai_lekkao) ||
            (keyval >= Gdk.KEY_Hangul_Kiyeog &&
                keyval <= Gdk.KEY_Hangul_J_YeorinHieuh) ||
            (keyval === Gdk.KEY_space && mask === 0) ||
            [
                Gdk.KEY_Home,
                Gdk.KEY_Left,
                Gdk.KEY_Up,
                Gdk.KEY_Right,
                Gdk.KEY_Down,
                Gdk.KEY_Page_Up,
                Gdk.KEY_Page_Down,
                Gdk.KEY_End,
                Gdk.KEY_Tab,
                Gdk.KEY_KP_Enter,
                Gdk.KEY_Return,
                Gdk.KEY_Mode_switch,
            ].includes(keyval)
        ) {
            return false;
        }
    }

    return Gtk.accelerator_valid(keyval, mask);
}

const CLUTTER_MOD4_MASK = 64;

export function clutterToGdkMask(mask: number) {
    return (mask & CLUTTER_MOD4_MASK) !== 0 ?
            (mask & ~CLUTTER_MOD4_MASK) | Gdk.ModifierType.SUPER_MASK
        :   mask;
}

export function gdkToClutterMask(mask: Gdk.ModifierType) {
    return (mask & Gdk.ModifierType.SUPER_MASK) !== 0 ?
            (mask & ~Gdk.ModifierType.SUPER_MASK) | CLUTTER_MOD4_MASK
        :   mask;
}

export function formatShortcut(shortcut: string) {
    const [, keyval, mask] = Gtk.accelerator_parse(shortcut);

    return Gtk.accelerator_get_label(keyval, mask);
}
