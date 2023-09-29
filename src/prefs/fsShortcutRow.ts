/* taShortcutRow.js
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

import {Adw, GObject, Gio, Gtk} from '../dependencies/prefs/gi.js';

import {FsShortcutEditor} from './fsShortcutEditor.js';

const NO_ACCEL_LABEL = 'Disabled';

export class FsShortcutRow extends Adw.ActionRow {
    static {
        GObject.registerClass(
            {
                GTypeName: 'FsShortcutRow',
                InternalChildren: ['accel-label', 'clear-button'],
                Template: import.meta.url.replace(
                    /prefs\/(.*).js$/,
                    'prefs/ui/$1.ui',
                ),
            },
            this,
        );
    }

    private declare readonly _accel_label: Gtk.Label;
    private declare readonly _clear_button: Gtk.Label;

    init({settings, key}: {settings: Gio.Settings; key: string}) {
        this.keepSyncedWithGSetting(settings, key);
        this._clear_button.connect('clicked', () => settings.set_strv(key, []));
        this.connect('activated', () => {
            new FsShortcutEditor({
                shortcutName: this.get_title()!,
                shortcutKey: key,
                transient_for: this.get_root(),
                destroy_with_parent: true,
            }).present();
        });
    }

    private keepSyncedWithGSetting(settings: Gio.Settings, key: string) {
        const id = settings.connect(`changed::${key}`, () => {
            this.setAccels(settings.get_strv(key));
        });

        this.connect('destroy', () => settings.disconnect(id));
        this.setAccels(settings.get_strv(key));
    }

    private setAccels(accels: string[]) {
        if (accels.length > 0) {
            const label = accels
                .map(accel => {
                    const [, keyval, mask] = Gtk.accelerator_parse(accel);
                    return Gtk.accelerator_get_label(keyval, mask) as string;
                })
                .join(' / ');

            this._clear_button.set_sensitive(true);
            this._accel_label.remove_css_class('dim-label');
            this._accel_label.set_label(label);
            this._accel_label.set_tooltip_text(label);
        } else {
            this._clear_button.set_sensitive(false);
            this._accel_label.add_css_class('dim-label');
            this._accel_label.set_label(NO_ACCEL_LABEL);
            this._accel_label.set_tooltip_text(NO_ACCEL_LABEL);
        }
    }
}
