import {
    Clutter,
    GLib,
    GObject,
    Main,
    Meta,
    Shell,
    St,
} from "../dependencies.js";

import { updateMultiStageShortcutActivators } from "../../shared.js";
import { Settings } from "./settings.js";
import { Timeouts } from "./timeouts.js";

/** @type {Shortcuts} */
let SINGLETON = null;

function enable() {
    SINGLETON = new Shortcuts();
}

function disable() {
    SINGLETON.destroy();
    SINGLETON = null;
}

const INVALID_KEY_SEQUENCE_STATUS_LABEL = "Invalid shortcut...";
const NO_INPUT_STATUS_LABEL = "No input given...";
const WAITING_FOR_NEXT_KEY_STATUS_LABEL = "Waiting for next keys...";
const UNKNOWN_ERROR_STATUS_LABEL = "Unknown error...";

class Shortcuts {
    /** @type {string[]} */
    _registeredShortcuts = [];

    /** @type {MultiStageShortcutManager} */
    _multiStageShortcutManager = new MultiStageShortcutManager();

    constructor() {
        updateMultiStageShortcutActivators(Settings.getGioObject());
    }

    destroy() {
        Settings.unwatch(this);

        this._registeredShortcuts.forEach((shortcut) =>
            Main.wm.removeKeybinding(shortcut),
        );
        this._registeredShortcuts = [];

        this._multiStageShortcutManager.destroy();
        this._multiStageShortcutManager = null;
    }

    /**
     * @param {object} param
     * @param {ShortcutKey} param.key
     * @param {Function} [param.handler] - optional only for multi-stage
     *      shortcuts activators
     * @param {Meta.KeyBindingFlags} [param.flags]
     * @param {Shell.ActionMode} [param.modes]
     */
    register({
        key,
        handler = () => {},
        flags = Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
        modes = Shell.ActionMode.NORMAL,
    }) {
        if (this._registeredShortcuts.includes(key)) {
            throw new Error(`Shortcut "${key}" is already registered.`);
        }

        this._watchShortcutTypeChange(key, handler, flags, modes);

        if (this._isMultiStageShortcut(key)) {
            this._multiStageShortcutManager.register(key, handler);

            return;
        }

        let shortcutAddedSuccessfully = false;

        if (this._isMultiStageShortcutPrimaryActivator(key)) {
            shortcutAddedSuccessfully = Main.wm.addKeybinding(
                key,
                Settings.getGioObject(),
                flags,
                modes,
                () => this._multiStageShortcutManager.start(key),
            );
        } else {
            shortcutAddedSuccessfully = Main.wm.addKeybinding(
                key,
                Settings.getGioObject(),
                flags,
                modes,
                handler,
            );
        }

        if (shortcutAddedSuccessfully) {
            this._registeredShortcuts.push(key);
        }
    }

    _isMultiStageShortcut(key) {
        return (
            Settings.getGioObject().get_strv(key).length > 1 &&
            !this._isMultiStageShortcutPrimaryActivator(key)
        );
    }

    _isMultiStageShortcutPrimaryActivator(key) {
        return key.match(/^multi-stage-shortcut-activator-\d+$/);
    }

    /**
     * @param {string} key
     * @param {Function} handler
     * @param {Meta.KeyBindingFlags} flags
     * @param {Shell.ActionMode} modes
     */
    _watchShortcutTypeChange(key, handler, flags, modes) {
        if (this._isMultiStageShortcutPrimaryActivator(key)) {
            return;
        }

        const id = Settings.watch(
            key,
            () => {
                // Multi-Stage -> Multi-Stage and Single -> Single shortcut
                // changes don't need to be handled. The reason for Multi-Stage
                // -> Multi-Stage is that we dynamically fetch the secondary
                // activators from the settings while the primary activator
                // (multi-stage-shortcut-activator-X) is registered just like a
                // Single shortcut and thus managed by the native keybinding
                // system. The later part applies to the Single -> Single
                // shortcut changes as well.

                const multiStageToSingle =
                    this._multiStageShortcutManager.isRegistered(key) &&
                    !this._isMultiStageShortcut(key);
                const singleToMultiStage =
                    !this._multiStageShortcutManager.isRegistered(key) &&
                    this._isMultiStageShortcut(key);

                if (multiStageToSingle) {
                    Settings.unwatch(id);

                    this._multiStageShortcutManager.unregister(key);

                    this.register({ key, handler, flags, modes });
                } else if (singleToMultiStage) {
                    Settings.unwatch(id);

                    Main.wm.removeKeybinding(key);
                    this._registeredShortcuts =
                        this._registeredShortcuts.filter(
                            (shortcut) => shortcut !== key,
                        );

                    this.register({ key, handler, flags, modes });
                }
            },
            { tracker: this },
        );
    }
}

class MultiStageShortcutManager extends Clutter.Actor {
    static {
        GObject.registerClass(this);
    }

    /** @type {Clutter.GrabState|null} */
    _grab = null;

    /** @type {Map<string, Function}>} */
    _handlers = new Map();

    /** @type {{primaryActivator: string, secondaryActivators: string[], handler: Function}[]} */
    _matchingMultiStageShortcuts = [];

    _statusLabel = new St.Label({
        opacity: 127,
        y_align: Clutter.ActorAlign.CENTER,
        visible: false,
    });

    constructor() {
        super({ reactive: true, visible: false });

        Main.panel._leftBox.add_child(this._statusLabel);
        global.stage.add_child(this);
    }

    destroy() {
        this._finish();

        this._handlers = null;
        this._matchingMultiStageShortcuts = null;

        this._statusLabel.destroy();
        this._statusLabel = null;

        super.destroy();
    }

    start(shortcutKey) {
        this.show();

        this._grab = Main.pushModal(this);

        if ((this._grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0) {
            this._finish(UNKNOWN_ERROR_STATUS_LABEL);

            return;
        }

        if (this._statusLabelHideTimer) {
            Timeouts.remove(this._statusLabelHideTimer);
            this._statusLabelHideTimer = 0;
        }

        this._statusLabel.show();
        this._statusLabel.text = WAITING_FOR_NEXT_KEY_STATUS_LABEL;

        this._matchingMultiStageShortcuts = [];

        const [activator] = Settings.getGioObject().get_strv(shortcutKey);

        this._handlers.forEach((handler, scKey) => {
            const [shortcutActivator, ...secondaryActivators] =
                Settings.getGioObject().get_strv(scKey);

            if (shortcutActivator === activator) {
                this._matchingMultiStageShortcuts.push({
                    handler,
                    primaryActivator: shortcutActivator,
                    secondaryActivators,
                });
            }
        });

        this._startWaitingForInputTimer();
    }

    register(shortcut, handler) {
        return this._handlers.set(shortcut, handler);
    }

    unregister(shortcut) {
        return this._handlers.delete(shortcut);
    }

    isRegistered(shortcut) {
        return this._handlers.has(shortcut);
    }

    vfunc_key_press_event(event) {
        this._startWaitingForInputTimer();

        const eventKeyval = event.get_key_symbol();

        if (this._ignoreKeyval(eventKeyval)) {
            return Clutter.EVENT_STOP;
        }

        for (
            let i = this._matchingMultiStageShortcuts.length - 1;
            i >= 0;
            i--
        ) {
            const matchingMultiStageShortcut =
                this._matchingMultiStageShortcuts[i];
            const { secondaryActivators } = matchingMultiStageShortcut;
            const nextActivator = secondaryActivators.shift();
            const [nextKeyval, nextModifiers] = nextActivator.split("+");
            const isMatchingActivator =
                nextKeyval === String(eventKeyval) &&
                // Wayland includes NumLock/fn as part of the state.
                (nextModifiers ?? "0") ===
                    String(event.get_state() & ~Clutter.ModifierType.MOD2_MASK);

            if (isMatchingActivator) {
                if (secondaryActivators.length === 0) {
                    this._finish();
                    matchingMultiStageShortcut.handler();

                    return Clutter.EVENT_STOP;
                }
            } else {
                this._matchingMultiStageShortcuts.splice(i, 1);
            }
        }

        if (this._matchingMultiStageShortcuts.length === 0) {
            this._finish(INVALID_KEY_SEQUENCE_STATUS_LABEL);
        }

        return Clutter.EVENT_STOP;
    }

    _finish(error = "") {
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }

        this._matchingMultiStageShortcuts = [];

        if (this._waitingForInputTimer) {
            Timeouts.remove(this._waitingForInputTimer);
            this._waitingForInputTimer = 0;
        }

        if (error) {
            this._statusLabel.show();
            this._statusLabel.text = error;
            this._statusLabelHideTimer = Timeouts.add({
                interval: 1500,
                fn: () => {
                    this._statusLabelHideTimer = 0;
                    this._statusLabel.hide();

                    return GLib.SOURCE_REMOVE;
                },
            });
        } else {
            this._statusLabel.hide();
        }

        this.hide();
    }

    _ignoreKeyval(keyval) {
        return [
            Clutter.KEY_Alt_L,
            Clutter.KEY_Alt_R,
            Clutter.KEY_Control_L,
            Clutter.KEY_Control_R,
            Clutter.KEY_Meta_L,
            Clutter.KEY_Meta_R,
            Clutter.KEY_Shift_L,
            Clutter.KEY_Shift_Lock,
            Clutter.KEY_Shift_R,
            Clutter.KEY_Super_L,
            Clutter.KEY_Super_R,
        ].includes(keyval);
    }

    _startWaitingForInputTimer() {
        this._waitingForInputTimer = Timeouts.add({
            name: "shell/shortcuts.js/MultiStageShortcutManager/_startWaitingForInputTimer",
            interval: 3000,
            fn: () => {
                this._waitingForInputTimer = 0;
                this._finish(NO_INPUT_STATUS_LABEL);

                return GLib.SOURCE_REMOVE;
            },
        });
    }
}

export { disable, enable, SINGLETON as Shortcuts };
