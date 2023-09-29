/* taShortcutEditor.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import {Adw, Gdk, Gio, GObject, Gtk} from '../dependencies/prefs/gi.js';

import {ExtensionPreferences} from '../dependencies/prefs.js';

const NO_ACCEL_LABEL = 'Shortcut disabled';
const APPEND_SHORTCUT_LABEL = 'Add a shortcut for ';
const REPLACE_SHORTCUT_LABEL = 'Enter a new shortcut for ';

export class FsShortcutEditor extends Adw.Window {
    static {
        GObject.registerClass(
            {
                GTypeName: 'FsShortcutEditor',
                InternalChildren: [
                    'append-shortcut-button',
                    'apply-changes-button',
                    'editing-shortcut-name-label',
                    'shortcut-preview-label',
                    'suggest-input-label',
                ],
                Template: import.meta.url.replace(
                    /prefs\/(.*).js$/,
                    'prefs/ui/$1.ui',
                ),
            },
            this,
        );
    }

    private declare readonly _append_shortcut_button: Gtk.ToggleButton;
    private declare readonly _apply_changes_button: Gtk.Button;
    private declare readonly _editing_shortcut_name_label: Gtk.Label;
    private declare readonly _shortcut_preview_label: Gtk.Label;
    private declare readonly _suggest_input_label: Gtk.Label;

    private readonly shortcutKey: string;
    private currentAccels: string[];

    constructor({
        shortcutName,
        shortcutKey,
        ...params
    }: {
        shortcutName: string;
        shortcutKey: string;
        [index: string]: unknown;
    }) {
        super(params);

        this.shortcutKey = shortcutKey;
        this.currentAccels = this.getSettings().get_strv(shortcutKey);

        this._editing_shortcut_name_label.set_label(`<b>${shortcutName}</b>.`);

        if (this.currentAccels.length > 0) {
            this.setPreviewLabel(
                this.currentAccels.map(this.accelToHumanReadable).join(' / '),
            );
        } else {
            this._shortcut_preview_label.set_label(
                '<i>Waiting for Input...</i>',
            );
        }
    }

    private accelToHumanReadable(accel: string): string {
        const [, keyval, mask] = Gtk.accelerator_parse(accel);

        return Gtk.accelerator_get_label(keyval, mask) as string;
    }

    private appendAccel(accel: string) {
        this.currentAccels = [...this.currentAccels, accel];
        this.setPreviewLabel(
            this.currentAccels.map(this.accelToHumanReadable).join(' / '),
        );
    }

    private getSettings(): Gio.Settings {
        return ExtensionPreferences.lookupByUUID(
            'floating-scroll@extensions.leleat',
        )!.getSettings();
    }

    /**
     * https://gitlab.com/rmnvgr/nightthemeswitcher-gnome-shell-extension/-/blob/main/src/utils.js
     */
    private isBindingValid({
        mask,
        keycode,
        keyval,
    }: {
        mask: Gdk.ModifierType;
        keycode: number;
        keyval: number;
    }): boolean {
        if (
            (mask === 0 || mask === Gdk.ModifierType.SHIFT_MASK) &&
            keycode !== 0
        ) {
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
                (keyval >= Gdk.KEY_Thai_kokai &&
                    keyval <= Gdk.KEY_Thai_lekkao) ||
                (keyval >= Gdk.KEY_Hangul_Kiyeog &&
                    keyval <= Gdk.KEY_Hangul_J_YeorinHieuh) ||
                (keyval === Gdk.KEY_space && mask === 0) ||
                this.isKeyvalForbidden(keyval)
            ) {
                return false;
            }
        }

        return true;
    }

    /**
     * https://gitlab.com/rmnvgr/nightthemeswitcher-gnome-shell-extension/-/blob/main/src/utils.js
     */
    private isKeyvalForbidden(keyval: number) {
        return [
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
        ].includes(keyval);
    }

    private replaceAccel(accel: string) {
        if (accel) {
            this.currentAccels = [accel];
            this.setPreviewLabel(this.accelToHumanReadable(accel));
        } else {
            this.currentAccels = [];
            this.setPreviewLabel(NO_ACCEL_LABEL, 'i');
        }
    }

    private setPreviewLabel(string: string, markup = 'b') {
        this._shortcut_preview_label.set_label(
            `<${markup}>${string}</${markup}>`,
        );
    }

    private on_append_shortcut_button_clicked() {
        if (this._append_shortcut_button.get_active()) {
            this._append_shortcut_button.set_active(true);
            this._suggest_input_label.set_label(APPEND_SHORTCUT_LABEL);
        } else {
            this._append_shortcut_button.set_active(false);
            this._suggest_input_label.set_label(REPLACE_SHORTCUT_LABEL);
        }
    }

    private on_apply_changes_button_clicked() {
        this.getSettings().set_strv(this.shortcutKey, this.currentAccels);
        this.close();
    }

    private on_event_controller_key_pressed(
        eventController: Gtk.EventController,
        keyval: number,
        keycode: number,
        state: Gdk.ModifierType,
    ) {
        const mask =
            state &
            Gtk.accelerator_get_default_mod_mask() &
            ~Gdk.ModifierType.LOCK_MASK;

        if (mask === 0) {
            switch (keyval) {
                case Gdk.KEY_Escape:
                    this.close();
                    return Gdk.EVENT_STOP;
                case Gdk.KEY_BackSpace:
                    this._apply_changes_button.set_sensitive(true);
                    this.replaceAccel('');
                    return Gdk.EVENT_STOP;
                case Gdk.KEY_KP_Enter:
                case Gdk.KEY_Return:
                case Gdk.KEY_space:
                    this.on_apply_changes_button_clicked();
                    return Gdk.EVENT_STOP;
            }
        }

        if (
            !this.isBindingValid({mask, keycode, keyval}) ||
            !Gtk.accelerator_valid(keyval, mask)
        ) {
            return Gdk.EVENT_STOP;
        }

        this._apply_changes_button.set_sensitive(true);

        const accel = Gtk.accelerator_name_with_keycode(
            null,
            keyval,
            keycode,
            mask,
        );

        if (this._append_shortcut_button.get_active()) {
            this.appendAccel(accel!);
        } else {
            this.replaceAccel(accel!);
        }

        return Gdk.EVENT_STOP;
    }
}
