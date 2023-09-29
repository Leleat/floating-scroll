/* extension.ts
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
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

import {
    Clutter,
    GLib,
    GObject,
    Gio,
    Graphene,
    Meta,
    Mtk,
    Shell,
    St,
} from './dependencies/gi.js';

import {Extension, Main} from './dependencies/shell.js';
import {getWindows} from './dependencies/unexported/altTab.js';

const GAP = 18;
let CREATED_WINDOW: Meta.Window | undefined;
let RESIZING_WINDOW: Meta.Window | undefined;

export default class FloatingScroll extends Extension {
    private readonly order: Meta.Window[] = [];
    private focusHint!: FocusHint;
    private registeredKeybindings: string[] = [];
    private settingsOverrider!: SettingsOverrider;
    private canScroll = true;
    private queuedRelayout = 0;

    override enable() {
        this.focusHint = new FocusHint();
        this.settingsOverrider = new SettingsOverrider({
            settings: this.getSettings(),
        });

        this.overrideNativeSettings();
        this.registerShortcuts();

        global.display.connectObject(
            'grab-op-begin',
            (_: Meta.Display, window: Meta.Window, grabOp: Meta.GrabOp) =>
                this.onGrabBegin(window, grabOp),
            'grab-op-end',
            (_: Meta.Display, window: Meta.Window, grabOp: Meta.GrabOp) =>
                this.onGrabEnd(window, grabOp),
            'notify::focus-window',
            () => this.onFocusWindowChanged(),
            'window-created',
            (_: Meta.Display, window: Meta.Window) =>
                this.onWindowCreated(window),
            this,
        );

        global.stage.connectObject(
            'captured-event',
            (_: Clutter.Actor, event: Clutter.Event) => this.scroll(event),
            this,
        );

        Main.overview.connectObject(
            'showing',
            () => this.onOverviewShowing(),
            'hidden',
            () => this.onOverviewHidden(),
            this,
        );
    }

    override disable() {
        Main.overview.disconnectObject(this);
        global.stage.disconnectObject(this);
        global.display.disconnectObject(this);
        global.get_window_actors().forEach(actor => {
            actor.disconnectObject(this);

            const window = actor.get_meta_window();

            if (!window) {
                return;
            }

            window.disconnectObject(this);

            delete window.floating_rect;
            delete window.is_maximized;
            delete window.is_maximized_vertically;
        });

        this.registeredKeybindings.forEach(kb => Main.wm.removeKeybinding(kb));
        this.registeredKeybindings.length = 0;

        this.settingsOverrider.destroy();
        this.settingsOverrider = undefined!;

        this.focusHint.destroy();
        this.focusHint = undefined!;

        this.order.length = 0;
    }

    registerShortcut(name: string, handler: (binding: string) => void) {
        if (
            Main.wm.addKeybinding(
                name,
                this.getSettings(),
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL,
                (_: Meta.Display, __: Meta.Window, binding: string) =>
                    handler(binding),
            )
        ) {
            this.registeredKeybindings.push(name);
        }
    }

    private alignTo(window: Meta.Window) {
        const index = this.order.indexOf(window);

        if (index === -1) {
            throw new Error(
                `FloatingScroll: Aligning untracked window............${window.get_wm_class()}`,
            );
        }

        // Right side of `window`
        for (let i = index + 1; i < this.order.length; i++) {
            const win = this.order[i];
            const prevWinRect = this.order[i - 1].get_frame_rect();

            this.move({
                window: win,
                x: prevWinRect.x + prevWinRect.width + GAP,
            });
        }

        // Left side of `window`
        for (let i = index - 1; i >= 0; i--) {
            const win = this.order[i];

            this.move({
                window: win,
                x:
                    this.order[i + 1].get_frame_rect().x -
                    win.get_frame_rect().width -
                    GAP,
            });
        }
    }

    private centerAround(
        visibleWindows: Meta.Window[],
        focus: Meta.Window,
        partiallyOffscreen: Meta.Window,
    ) {
        const workArea = global.workspace_manager
            .get_active_workspace()
            .get_work_area_for_monitor(global.display.get_current_monitor());

        if (
            this.order.indexOf(partiallyOffscreen) < this.order.indexOf(focus)
        ) {
            const rightmost = visibleWindows.reduce((currRightmost, window) =>
                this.order.indexOf(currRightmost) > this.order.indexOf(window)
                    ? currRightmost
                    : window,
            );
            const gap = rightmost === this.order.at(-1) ? GAP : GAP * 2;

            this.move({
                window: rightmost,
                x:
                    workArea.x +
                    workArea.width -
                    rightmost.get_frame_rect().width -
                    gap,
            });

            this.alignTo(rightmost);
        } else {
            const leftmost = visibleWindows.reduce((currLeftmost, window) =>
                this.order.indexOf(currLeftmost) < this.order.indexOf(window)
                    ? currLeftmost
                    : window,
            );
            const gap = leftmost === this.order[0] ? GAP : GAP * 2;

            this.move({
                window: leftmost,
                x: workArea.x + gap,
            });

            this.alignTo(leftmost);
        }
    }

    private centerEverything() {
        const workArea = global.workspace_manager
            .get_active_workspace()
            .get_work_area_for_monitor(global.display.get_current_monitor());

        if (this.summedWidth(this.order) > workArea.width) {
            throw new Error(
                "FloatingScroll: Trying to center everything even though it doesn't fit the screen..............",
            );
        }

        const startingPoint =
            workArea.x + workArea.width / 2 - this.summedWidth(this.order) / 2;
        const [firstWindow] = this.order;

        this.move({
            window: firstWindow,
            x: startingPoint,
        });

        this.alignTo(firstWindow);
    }

    private findMruNeighbor(
        mrus: Meta.Window[],
        window: Meta.Window,
    ): Meta.Window | undefined {
        const [leftNeighbor, rightNeighbor] = this.getNeighbors(window);

        if (leftNeighbor && rightNeighbor) {
            const mru =
                mrus[
                    Math.min(
                        mrus.indexOf(leftNeighbor),
                        mrus.indexOf(rightNeighbor),
                    )
                ];

            if (!mru) {
                throw new Error(
                    "FloatingScroll: Couldn't find the neighbor in the MRU list...............",
                );
            }

            return mru;
        } else {
            return leftNeighbor ?? rightNeighbor;
        }
    }

    private findOuterWindows(
        windows: Meta.Window[],
    ): [Meta.Window, Meta.Window] {
        if (windows.length === 0) {
            throw new Error(
                'FloatingScroll: Empty window list.................',
            );
        }

        const [firstWindow] = windows;
        const {leftmost, rightmost} = windows.reduce(
            (result, window) => {
                const index = this.order.indexOf(window);

                if (index < this.order.indexOf(result.leftmost)) {
                    result.leftmost = window;
                }

                if (index > this.order.indexOf(result.rightmost)) {
                    result.rightmost = window;
                }

                return result;
            },
            {
                leftmost: firstWindow,
                rightmost: firstWindow,
            },
        );

        return [leftmost, rightmost];
    }

    private getNeighbors(
        window: Meta.Window,
    ): [Meta.Window | undefined, Meta.Window | undefined] {
        const index = this.order.indexOf(window);
        const leftNeighbor = this.order[index - 1];
        const rightNeighbor = this.order[index + 1];

        return [leftNeighbor, rightNeighbor];
    }

    private indicateFocus() {
        const focus = global.display.focus_window as Meta.Window;

        if (this.order.includes(focus)) {
            const rect = focus.get_frame_rect().copy();

            rect.x -= GAP / 2;
            rect.y -= GAP / 2;
            rect.width += GAP;
            rect.height += GAP;

            this.focusHint.open(focus, rect);
        } else {
            this.focusHint.close();
        }
    }

    private move({window, x}: {window: Meta.Window; x: number}) {
        const preMoveRect = window.get_frame_rect();
        const workArea = global.workspace_manager
            .get_active_workspace()
            .get_work_area_for_monitor(global.display.get_current_monitor());
        const y = workArea.y + workArea.height / 2 - preMoveRect.height / 2;
        const actor = window.get_compositor_private() as Meta.WindowActor;

        /**
         * Animate a clone. The window can't go completely offscreen due to a
         * constraint: https://gitlab.gnome.org/GNOME/mutter/-/blob/main/src/core/constraints.c?ref_type=heads#L1797
         * That's why we hide the window and keep the clone around to animate
         * it, if the window should go past the constraint and be offscreen...
         * When resizing, don't use a clone to avoide double appearance.
         */

        if (RESIZING_WINDOW === window) {
            window.move_frame(true, x, y);

            return;
        }

        if (window.clone) {
            window.clone.remove_all_transitions();
        } else {
            window.clone = new Clutter.Clone({
                reactive: true,
                source: actor,
                pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
                x: actor.x,
                y: actor.y,
                width: actor.width,
                height: actor.height,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                y_expand: true,
            });

            Main.uiGroup.add_child(window.clone);

            window.clone.connect('button-press-event', () => {
                window.focus(global.get_current_time());
            });
        }

        actor.remove_all_transitions();
        actor.set_opacity(0);
        actor.hide();

        const xOffset = actor.x - preMoveRect.x;
        const yOffset = actor.y - preMoveRect.y;
        const finalCloneX = x + xOffset;
        const finalCloneY =
            workArea.y + workArea.height / 2 - preMoveRect.height / 2 + yOffset;

        // Skip initial movement animation (from mutter's native positioning)
        // and just use a scaling anim.
        if (CREATED_WINDOW === window) {
            window.clone.set_position(finalCloneX, finalCloneY);
            window.clone.set_scale(0.8, 0.8);
            window.clone.set_opacity(0);
        }

        const constraint = 75;
        const willBeOffscreen =
            x + preMoveRect.width <= constraint ||
            x >= workArea.x + workArea.width - constraint;

        window.clone.ease({
            x: finalCloneX,
            y: finalCloneY,
            opacity: 255,
            scale_x: 1,
            scale_y: 1,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT,
            onComplete: () => {
                if (!willBeOffscreen) {
                    window.clone!.destroy();
                    window.clone = undefined;
                    actor.show();
                    actor.set_opacity(255);
                }
            },
        });

        window.move_frame(true, x, y);
    }

    private overrideNativeSettings() {
        const mutterSettings = new Gio.Settings({
            schema_id: 'org.gnome.mutter',
        });

        this.settingsOverrider.override(
            mutterSettings,
            'edge-tiling',
            new GLib.Variant('b', false),
        );
        this.settingsOverrider.override(
            mutterSettings,
            'dynamic-workspaces',
            new GLib.Variant('b', false),
        );

        const wmPrefsSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.wm.preferences',
        });

        this.settingsOverrider.override(
            wmPrefsSettings,
            'num-workspaces',
            new GLib.Variant('i', 1),
        );

        const wmKeybindingsSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.wm.keybindings',
        });

        if (
            wmKeybindingsSettings
                .get_strv('move-to-monitor-left')
                .includes('<Super><Shift>Left')
        ) {
            this.settingsOverrider.override(
                wmKeybindingsSettings,
                'move-to-monitor-left',
                new GLib.Variant('as', []),
            );
        }

        if (
            wmKeybindingsSettings
                .get_strv('move-to-monitor-right')
                .includes('<Super><Shift>Right')
        ) {
            this.settingsOverrider.override(
                wmKeybindingsSettings,
                'move-to-monitor-right',
                new GLib.Variant('as', []),
            );
        }

        if (
            wmKeybindingsSettings
                .get_strv('switch-to-workspace-left')
                .includes('<Alt><Super>Left') ||
            wmKeybindingsSettings
                .get_strv('switch-to-workspace-left')
                .includes('<Super><Alt>Left')
        ) {
            this.settingsOverrider.override(
                wmKeybindingsSettings,
                'switch-to-workspace-left',
                new GLib.Variant('as', []),
            );
        }

        if (
            wmKeybindingsSettings
                .get_strv('switch-to-workspace-right')
                .includes('<Alt><Super>Right') ||
            wmKeybindingsSettings
                .get_strv('switch-to-workspace-right')
                .includes('<Super><Alt>Right')
        ) {
            this.settingsOverrider.override(
                wmKeybindingsSettings,
                'switch-to-workspace-right',
                new GLib.Variant('as', []),
            );
        }

        if (
            wmKeybindingsSettings
                .get_strv('move-to-workspace-left')
                .includes('<Super><Shift><Alt>Left') ||
            wmKeybindingsSettings
                .get_strv('move-to-workspace-left')
                .includes('<Shift><Alt><Super>Left')
        ) {
            this.settingsOverrider.override(
                wmKeybindingsSettings,
                'move-to-workspace-left',
                new GLib.Variant('as', []),
            );
        }

        if (
            wmKeybindingsSettings
                .get_strv('move-to-workspace-right')
                .includes('<Shift><Alt><Super>Right') ||
            wmKeybindingsSettings
                .get_strv('move-to-workspace-right')
                .includes('<Super><Shift><Alt>Right')
        ) {
            this.settingsOverrider.override(
                wmKeybindingsSettings,
                'move-to-workspace-right',
                new GLib.Variant('as', []),
            );
        }

        if (wmKeybindingsSettings.get_strv('maximize').includes('<Super>Up')) {
            this.settingsOverrider.override(
                wmKeybindingsSettings,
                'maximize',
                new GLib.Variant('as', []),
            );
        }

        if (
            wmKeybindingsSettings.get_strv('unmaximize').includes('<Super>Down')
        ) {
            this.settingsOverrider.override(
                wmKeybindingsSettings,
                'unmaximize',
                new GLib.Variant('as', []),
            );
        }

        const mutterKeybindingsSettings = new Gio.Settings({
            schema_id: 'org.gnome.mutter.keybindings',
        });

        if (
            mutterKeybindingsSettings
                .get_strv('toggle-tiled-left')
                .includes('<Super>Left')
        ) {
            this.settingsOverrider.override(
                mutterKeybindingsSettings,
                'toggle-tiled-left',
                new GLib.Variant('as', []),
            );
        }

        if (
            mutterKeybindingsSettings
                .get_strv('toggle-tiled-right')
                .includes('<Super>Right')
        ) {
            this.settingsOverrider.override(
                mutterKeybindingsSettings,
                'toggle-tiled-right',
                new GLib.Variant('as', []),
            );
        }
    }

    private registerShortcuts() {
        this.registerShortcut('focus-left', () => {
            const index = this.order.indexOf(global.display.focus_window!);

            if (index !== -1) {
                this.order.at(index - 1)?.focus(global.get_current_time());
            }
        });
        this.registerShortcut('focus-right', () => {
            const index = this.order.indexOf(global.display.focus_window!);

            if (index !== -1) {
                this.order
                    .at((index + 1) % this.order.length)
                    ?.focus(global.get_current_time());
            }
        });
        this.registerShortcut('move-left', () => {
            const index = this.order.indexOf(global.display.focus_window!);

            if (index > 0) {
                const [window] = this.order.splice(index, 1);

                this.order.splice(index - 1, 0, window);
                this.relayout();
            }
        });
        this.registerShortcut('move-right', () => {
            const index = this.order.indexOf(global.display.focus_window!);

            if (index !== -1 && index < this.order.length - 1) {
                const [window] = this.order.splice(index, 1);

                this.order.splice(index + 1, 0, window);
                this.relayout();
            }
        });
        this.registerShortcut('shift-up', () => {
            const focus = global.display.focus_window as Meta.Window;
            const index = this.order.indexOf(focus);

            if (index === -1) {
                return;
            }

            if (focus.is_maximized) {
                return;
            }

            const actor = focus.get_compositor_private() as Meta.WindowActor;
            const currRect = focus.get_frame_rect();
            const workArea = global.workspace_manager
                .get_active_workspace()
                .get_work_area_for_monitor(focus.get_monitor());

            if (focus.is_maximized_vertically) {
                if (actor) {
                    actor.remove_all_transitions();
                    Main.wm._prepareAnimationInfo(
                        global.window_manager,
                        actor,
                        currRect,
                        Meta.SizeChange.MAXIMIZE,
                    );
                }

                focus.move_resize_frame(
                    true,
                    workArea.x + 2 * GAP,
                    workArea.y + GAP,
                    workArea.width - 4 * GAP,
                    workArea.height - GAP,
                );

                focus.is_maximized = true;
                focus.is_maximized_vertically = false;
            } else {
                if (actor) {
                    actor.remove_all_transitions();
                    Main.wm._prepareAnimationInfo(
                        global.window_manager,
                        actor,
                        currRect,
                        Meta.SizeChange.MAXIMIZE,
                    );
                }

                focus.move_resize_frame(
                    true,
                    currRect.x,
                    workArea.y + GAP,
                    currRect.width,
                    workArea.height - 2 * GAP,
                );

                focus.is_maximized_vertically = true;
                focus.floating_rect = currRect;
            }
        });
        this.registerShortcut('shift-down', () => {
            const focus = global.display.focus_window as Meta.Window;
            const index = this.order.indexOf(focus);

            if (index === -1) {
                return;
            }

            if (focus.is_maximized || focus.is_maximized_vertically) {
                const actor =
                    focus.get_compositor_private() as Meta.WindowActor;
                const currRect = focus.get_frame_rect();
                const workArea = global.workspace_manager
                    .get_active_workspace()
                    .get_work_area_for_monitor(focus.get_monitor());

                if (actor) {
                    actor.remove_all_transitions();
                    Main.wm._prepareAnimationInfo(
                        global.window_manager,
                        actor,
                        currRect,
                        Meta.SizeChange.MAXIMIZE,
                    );
                }

                focus.move_resize_frame(
                    true,
                    currRect.x,
                    workArea.y +
                        workArea.height / 2 -
                        focus.floating_rect.height / 2,
                    focus.floating_rect.width,
                    focus.floating_rect.height,
                );

                focus.is_maximized = false;
                focus.is_maximized_vertically = false;
                focus.floating_rect = undefined;
            } else {
                console.warn(
                    'FloatingScroll: Sticky layer not implemented...............',
                );
            }
        });
    }

    private relayout() {
        if (this.queuedRelayout) {
            GLib.source_remove(this.queuedRelayout);
            this.queuedRelayout = 0;
        }

        const mrus = getWindows(
            global.workspace_manager.get_active_workspace(),
        ) as Meta.Window[];

        if (mrus.length === 0) {
            this.indicateFocus();

            return;
        }

        const visible = [mrus.shift()] as Meta.Window[];
        const workArea = global.workspace_manager
            .get_active_workspace()
            .get_work_area_for_monitor(global.display.get_current_monitor());

        while (mrus.length > 0) {
            const [leftmost, rightmost] = this.findOuterWindows(visible);
            const maybeLeftNeighbor =
                this.order[this.order.indexOf(leftmost) - 1];
            const maybeRightNeighbor =
                this.order[this.order.indexOf(rightmost) + 1];
            const mruNeighbor =
                maybeLeftNeighbor && maybeRightNeighbor
                    ? mrus[
                          Math.min(
                              mrus.indexOf(maybeLeftNeighbor),
                              mrus.indexOf(maybeRightNeighbor),
                          )
                      ]
                    : maybeLeftNeighbor ?? maybeRightNeighbor;

            mrus.splice(mrus.indexOf(mruNeighbor), 1);
            visible.push(mruNeighbor);

            if (this.summedWidth(visible) > workArea.width) {
                const [focus] = visible;
                const partiallyOffscreen = visible.at(-1) as Meta.Window;

                this.centerAround(visible, focus, partiallyOffscreen);
                this.indicateFocus();

                return;
            }
        }

        this.centerEverything();
        this.indicateFocus();
    }

    private scroll(event: Clutter.Event): boolean {
        if (event.type() !== Clutter.EventType.SCROLL) {
            return Clutter.EVENT_PROPAGATE;
        }

        if ((Main.actionMode & Shell.ActionMode.NORMAL) === 0) {
            return Clutter.EVENT_PROPAGATE;
        }

        const index = this.order.indexOf(global.display.focus_window!);
        let newIndex = index;

        if (index === -1) {
            return Clutter.EVENT_PROPAGATE;
        }

        if (!this.canScroll) {
            return Clutter.EVENT_STOP;
        }

        let direction;

        if (event.get_scroll_direction() === Clutter.ScrollDirection.SMOOTH) {
            const [dx, dy] = event.get_scroll_delta();

            if (dx > 0) {
                direction = Clutter.ScrollDirection.RIGHT;
            } else if (dx < 0) {
                direction = Clutter.ScrollDirection.LEFT;
            } else if (dy > 0) {
                direction = Clutter.ScrollDirection.DOWN;
            } else if (dy < 0) {
                direction = Clutter.ScrollDirection.UP;
            }
        } else {
            direction = event.get_scroll_direction();
        }

        const rtl =
            Clutter.get_default_text_direction() === Clutter.TextDirection.RTL;

        switch (direction) {
            case Clutter.ScrollDirection.UP:
                if (rtl) {
                    newIndex++;
                } else {
                    newIndex--;
                }

                break;
            case Clutter.ScrollDirection.DOWN:
                if (rtl) {
                    newIndex--;
                } else {
                    newIndex++;
                }

                break;
            case Clutter.ScrollDirection.LEFT:
                newIndex--;

                break;
            case Clutter.ScrollDirection.RIGHT:
                newIndex++;

                break;
            default:
                console.warn(
                    'FloatingScroll: Unhandled scrolling direction............',
                );
        }

        this.order
            .at(newIndex % this.order.length)
            ?.focus(global.get_current_time());

        this.canScroll = false;
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 125, () => {
            this.canScroll = true;
            return GLib.SOURCE_REMOVE;
        });

        return Clutter.EVENT_STOP;
    }

    private summedWidth(windows: Meta.Window[]): number {
        return windows
            .map(w => w.get_frame_rect().width)
            .reduce((sum, width) => sum + width);
    }

    private onGrabBegin(window: Meta.Window, grabOp: Meta.GrabOp) {
        const resizeOps =
            Meta.GrabOp.RESIZING_N |
            Meta.GrabOp.RESIZING_E |
            Meta.GrabOp.RESIZING_S |
            Meta.GrabOp.RESIZING_W |
            Meta.GrabOp.KEYBOARD_RESIZING_N |
            Meta.GrabOp.KEYBOARD_RESIZING_E |
            Meta.GrabOp.KEYBOARD_RESIZING_S |
            Meta.GrabOp.KEYBOARD_RESIZING_W;
        const verticalResizeOps =
            Meta.GrabOp.RESIZING_N |
            Meta.GrabOp.RESIZING_S |
            Meta.GrabOp.KEYBOARD_RESIZING_N |
            Meta.GrabOp.KEYBOARD_RESIZING_S;

        if (grabOp & verticalResizeOps) {
            window.is_maximized = false;
            window.is_maximized_vertically = false;
            window.floating_rect = undefined;
        } else if (grabOp & resizeOps) {
            window.is_maximized = false;
            window.floating_rect = undefined;
        }
    }

    // eslint-disable-next-line
    private onGrabEnd(window: Meta.Window, grabOp: Meta.GrabOp) {
        this.relayout();
    }

    private onFocusWindowChanged() {
        // Let the window-created signal handle this since the window isn't
        // realized yet, which may lead to unexpected side-effects...
        if (!this.order.includes(global.display.focus_window!)) {
            return;
        }

        if (this.queuedRelayout) {
            GLib.source_remove(this.queuedRelayout);
        }

        // Focus change comes too early, so delay it...
        this.queuedRelayout = GLib.timeout_add(GLib.PRIORITY_LOW, 75, () => {
            this.relayout();
            this.queuedRelayout = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    private onOverviewHidden() {
        this.indicateFocus();

        global
            .get_window_actors()
            .map(actor => actor.get_meta_window())
            .forEach(window => window?.clone?.show());
    }

    private onOverviewShowing() {
        this.focusHint.close();

        global
            .get_window_actors()
            .map(actor => actor.get_meta_window())
            .forEach(window => window?.clone?.hide());
    }

    private onWindowCreated(window: Meta.Window) {
        if (window.get_window_type() !== Meta.WindowType.NORMAL) {
            return;
        }

        window
            .get_compositor_private()
            ?.connectObject(
                'first-frame',
                () => this.onWindowReady(window),
                this,
            );
        window.connectObject(
            'size-changed',
            () => this.onWindowSizeChanged(window),
            this,
        );
        window.connectObject(
            'unmanaged',
            () => this.onWindowClosed(window),
            this,
        );
    }

    private onWindowReady(window: Meta.Window) {
        if (
            window.is_override_redirect() ||
            window.is_attached_dialog() ||
            window.is_on_all_workspaces()
        ) {
            return;
        }

        CREATED_WINDOW = window;

        if (this.order.length <= 1) {
            this.order.push(window);
            this.relayout();

            CREATED_WINDOW = undefined;

            return;
        }

        const mrus = getWindows(
            global.workspace_manager.get_active_workspace(),
        ) as Meta.Window[];

        // Remove newly opened window
        mrus.shift();

        const mru = mrus.shift() as Meta.Window;
        const mruIndex = this.order.indexOf(mru);
        const mruNeighbor = this.findMruNeighbor(mrus, mru) as Meta.Window;
        const mruNeighborIndex = this.order.indexOf(mruNeighbor);

        this.order.splice(
            mruIndex < mruNeighborIndex ? mruIndex + 1 : mruIndex,
            0,
            window,
        );
        this.relayout();

        CREATED_WINDOW = undefined;
    }

    private onWindowClosed(window: Meta.Window) {
        const idx = this.order.indexOf(window);

        // Dialogs, extension enabled during running session etc...
        if (idx === -1) {
            return;
        }

        this.order.splice(idx, 1);
        this.relayout();
    }

    private onWindowSizeChanged(window: Meta.Window) {
        // Let the window-created signal handle this since the window isn't
        // realized yet.
        if (!this.order.includes(global.display.focus_window!)) {
            return;
        }

        if (this.queuedRelayout) {
            GLib.source_remove(this.queuedRelayout);
        }

        this.queuedRelayout = GLib.timeout_add(GLib.PRIORITY_LOW, 50, () => {
            RESIZING_WINDOW = window;
            this.relayout();
            RESIZING_WINDOW = undefined;

            this.queuedRelayout = 0;
            return GLib.SOURCE_REMOVE;
        });
    }
}

/**
 * Basically copy-pasta from WindowManager.TilePreview with custom style etc.
 */
class FocusHint extends St.Widget {
    static {
        GObject.registerClass(this);
    }

    private showing = false;
    private rect?: Mtk.Rectangle;
    private monitor = -1;

    constructor() {
        super({
            style: `\
                background-color: rgba(255, 255, 255, 0.3); \
                border: 1px solid rgba(128, 128, 128, 0.5); \
                border-radius: 6px; \
            `,
        });

        Main.layoutManager._backgroundGroup.add_child(this);

        this.reset();
    }

    open(window: Meta.Window, rect: Mtk.Rectangle) {
        if (this.rect && this.rect.equal(rect)) {
            return;
        }

        const monitorIndex = window.get_monitor();
        const changeMonitor =
            this.monitor === -1 || this.monitor !== monitorIndex;

        this.monitor = monitorIndex;
        this.rect = rect;

        if (!this.showing || changeMonitor) {
            const monitor = Main.layoutManager.monitors[monitorIndex];
            const monitorRect = new Mtk.Rectangle({
                x: monitor.x,
                y: monitor.y,
                width: monitor.width,
                height: monitor.height,
            });
            const [, startingRect] = window
                .get_frame_rect()
                .intersect(monitorRect);

            this.set_size(startingRect.width, startingRect.height);
            this.set_position(startingRect.x, startingRect.y);
            this.opacity = 0;
        }

        this.showing = true;
        this.show();
        this.ease({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    close() {
        if (!this.showing) {
            return;
        }

        this.showing = false;
        this.ease({
            opacity: 0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.reset(),
        });
    }

    private reset() {
        this.hide();
        this.rect = undefined;
        this.monitor = -1;
    }
}

type SchemaId = string;
type SchemaKey = string;

class SettingsOverrider {
    private readonly gioSettings: Gio.Settings;
    private readonly overrides: Map<
        SchemaId,
        Map<SchemaKey, GLib.Variant | null>
    > = new Map();

    private didntDisablePreviously: boolean;

    constructor({settings}: {settings: Gio.Settings}) {
        this.gioSettings = settings;

        this.didntDisablePreviously =
            this.gioSettings.get_user_value('overridden-settings') !== null;
    }

    destroy() {
        this.clearOverrides();

        // @ts-expect-error escape readonly
        this.gioSettings = undefined;
    }

    override(gioSettings: Gio.Settings, key: string, newValue: GLib.Variant) {
        const schemaId = gioSettings.schema_id as string;
        const userValue = gioSettings.get_user_value(key);
        const oldSettingsMap = this.overrides.get(schemaId);

        if (oldSettingsMap) {
            oldSettingsMap.set(key, userValue);
        } else {
            this.overrides.set(schemaId, new Map([[key, userValue]]));
        }

        gioSettings.set_value(key, newValue);

        this.maybeUpdateSavedSetting(gioSettings.schema_id!, key, userValue);
    }

    private clearOverrides() {
        if (this.didntDisablePreviously) {
            const previouslySavedSettings = this.gioSettings
                .get_value('overridden-settings')
                .unpack();

            // @ts-expect-error ...
            Object.entries(previouslySavedSettings).forEach(([path, value]) => {
                const splits = path.split('.');
                const key = splits.at(-1) as string;
                const schemaId = splits.slice(0, -1).join('.');
                const gioSettings = new Gio.Settings({schema_id: schemaId});
                // @ts-expect-error ...
                const variant = value.get_variant();

                if (
                    variant.equal(
                        GLib.Variant.new_maybe(new GLib.VariantType('b'), null),
                    )
                ) {
                    gioSettings.reset(key);
                } else {
                    gioSettings.set_value(key, variant);
                }
            });
        } else {
            this.overrides.forEach((overrides, schemaId) => {
                const gioSettings = new Gio.Settings({schema_id: schemaId});

                overrides.forEach((value, key) => {
                    if (value) {
                        gioSettings.set_value(key, value);
                    } else {
                        gioSettings.reset(key);
                    }
                });
            });
        }

        this.gioSettings.reset('overridden-settings');
        this.overrides.clear();
    }

    private maybeUpdateSavedSetting(
        schemaId: string,
        key: string,
        newValue: GLib.Variant | null,
    ) {
        if (this.didntDisablePreviously) {
            return;
        }

        const savedSettings = this.gioSettings
            .get_value('overridden-settings')
            .deepUnpack();
        const prefKey = `${schemaId}.${key}`;

        // @ts-expect-error ...
        savedSettings[prefKey] =
            newValue ?? GLib.Variant.new_maybe(new GLib.VariantType('b'), null);

        this.gioSettings.set_value(
            'overridden-settings',
            new GLib.Variant('a{sv}', savedSettings),
        );
    }
}
