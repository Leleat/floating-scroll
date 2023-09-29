/* gi-augments.d.ts
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

import './gi';

declare module './gi' {
    namespace Clutter {
        interface Actor {
            ease: (props: object) => void;
            set: (params: {[prop: string]: unknown}) => void;
        }
    }

    namespace GObject {
        interface Object {
            connectObject: (...args: unknown[]) => void;
            disconnectObject: (object: object) => void;
        }
    }

    namespace Meta {
        interface Window {
            clone?: Clutter.Clone;
            floating_rect?: Mtk.Rectangle;
            is_maximized?: boolean;
            is_maximized_vertically?: boolean;
        }
    }
}
