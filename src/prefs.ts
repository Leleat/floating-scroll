/* prefs.ts
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

import {Adw, Gio, Gtk} from './dependencies/prefs/gi.js';
import {ExtensionPreferences} from './dependencies/prefs.js';

import {FsShortcutRow} from './prefs/fsShortcutRow.js';

export default class FloatingScrollPrefs extends ExtensionPreferences {
    override fillPreferencesWindow(window: Adw.PreferencesWindow) {
        this.loadResources(window);

        const builder = new Gtk.Builder();

        builder.add_from_file(`${this.path}/prefs/ui/pageGeneral.ui`);

        this.addPage('page-general', builder, window);

        this.bindShortcuts(builder, this.getSettings());
    }

    private addPage(
        id: string,
        builder: Gtk.Builder,
        window: Adw.PreferencesWindow,
    ) {
        const prefsPage = builder.get_object(id);

        if (!(prefsPage instanceof Adw.PreferencesPage)) {
            throw new Error('');
        }

        window.add(prefsPage);
    }

    private bindShortcuts(builder: Gtk.Builder, gioSettings: Gio.Settings) {
        const shortcutKeys = [
            'focus-left',
            'focus-right',
            'move-left',
            'move-right',
            'shift-up',
            'shift-down',
        ];

        shortcutKeys.forEach(key => {
            const shortcutRow = builder.get_object(key);

            if (!(shortcutRow instanceof FsShortcutRow)) {
                throw new Error();
            }

            shortcutRow.init({settings: gioSettings, key});
        });
    }

    private loadResources(window: Adw.PreferencesWindow) {
        const resources = Gio.Resource.load(
            import.meta.url.replace(
                /file:\/\/(.*)\/prefs.js$/,
                '$1/floating-scroll.gresource',
            ),
        );

        Gio.resources_register(resources);
        window.connect('close-request', () => {
            Gio.resources_unregister(resources);
        });
    }
}
