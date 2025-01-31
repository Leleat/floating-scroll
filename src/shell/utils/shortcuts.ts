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
    #registeredShortcuts = [];

    /** @type {MultiStageShortcutManager} */
    #multiStageShortcutManager = new MultiStageShortcutManager();

    constructor() {
        updateMultiStageShortcutActivators(Settings.getGioObject());
    }

    destroy() {
        Settings.unwatch(this);

        this.#registeredShortcuts.forEach((shortcut) =>
            Main.wm.removeKeybinding(shortcut),
        );
        this.#registeredShortcuts = [];

        this.#multiStageShortcutManager.destroy();
        this.#multiStageShortcutManager = null;
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
        if (this.#registeredShortcuts.includes(key)) {
            throw new Error(`Shortcut "${key}" is already registered.`);
        }

        this.#watchShortcutTypeChange(key, handler, flags, modes);

        if (this.#isMultiStageShortcut(key)) {
            this.#multiStageShortcutManager.register(key, handler);

            return;
        }

        let shortcutAddedSuccessfully = false;

        if (this.#isMultiStageShortcutPrimaryActivator(key)) {
            shortcutAddedSuccessfully = Main.wm.addKeybinding(
                key,
                Settings.getGioObject(),
                flags,
                modes,
                () => this.#multiStageShortcutManager.start(key),
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
            this.#registeredShortcuts.push(key);
        }
    }

    #isMultiStageShortcut(key) {
        return (
            Settings.getGioObject().get_strv(key).length > 1 &&
            !this.#isMultiStageShortcutPrimaryActivator(key)
        );
    }

    #isMultiStageShortcutPrimaryActivator(key) {
        return key.match(/^multi-stage-shortcut-activator-\d+$/);
    }

    /**
     * @param {string} key
     * @param {Function} handler
     * @param {Meta.KeyBindingFlags} flags
     * @param {Shell.ActionMode} modes
     */
    #watchShortcutTypeChange(key, handler, flags, modes) {
        if (this.#isMultiStageShortcutPrimaryActivator(key)) {
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
                    this.#multiStageShortcutManager.isRegistered(key) &&
                    !this.#isMultiStageShortcut(key);
                const singleToMultiStage =
                    !this.#multiStageShortcutManager.isRegistered(key) &&
                    this.#isMultiStageShortcut(key);

                if (multiStageToSingle) {
                    Settings.unwatch(id);

                    this.#multiStageShortcutManager.unregister(key);

                    this.register({ key, handler, flags, modes });
                } else if (singleToMultiStage) {
                    Settings.unwatch(id);

                    Main.wm.removeKeybinding(key);
                    this.#registeredShortcuts =
                        this.#registeredShortcuts.filter(
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
    #grab = null;

    /** @type {Map<string, Function}>} */
    #handlers = new Map();

    /** @type {{primaryActivator: string, secondaryActivators: string[], handler: Function}[]} */
    #matchingMultiStageShortcuts = [];

    #statusLabel = new St.Label({
        opacity: 127,
        y_align: Clutter.ActorAlign.CENTER,
        visible: false,
    });

    constructor() {
        super({ reactive: true, visible: false });

        Main.panel._leftBox.add_child(this.#statusLabel);
        global.stage.add_child(this);
    }

    destroy() {
        this.#finish();

        this.#handlers = null;
        this.#matchingMultiStageShortcuts = null;

        this.#statusLabel.destroy();
        this.#statusLabel = null;

        super.destroy();
    }

    start(shortcutKey) {
        this.show();

        this.#grab = Main.pushModal(this);

        if ((this.#grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0) {
            this.#finish(UNKNOWN_ERROR_STATUS_LABEL);

            return;
        }

        if (this._statusLabelHideTimer) {
            Timeouts.remove(this._statusLabelHideTimer);
            this._statusLabelHideTimer = 0;
        }

        this.#statusLabel.show();
        this.#statusLabel.text = WAITING_FOR_NEXT_KEY_STATUS_LABEL;

        this.#matchingMultiStageShortcuts = [];

        const [activator] = Settings.getGioObject().get_strv(shortcutKey);

        this.#handlers.forEach((handler, scKey) => {
            const [shortcutActivator, ...secondaryActivators] =
                Settings.getGioObject().get_strv(scKey);

            if (shortcutActivator === activator) {
                this.#matchingMultiStageShortcuts.push({
                    handler,
                    primaryActivator: shortcutActivator,
                    secondaryActivators,
                });
            }
        });

        this.#startWaitingForInputTimer();
    }

    register(shortcut, handler) {
        return this.#handlers.set(shortcut, handler);
    }

    unregister(shortcut) {
        return this.#handlers.delete(shortcut);
    }

    isRegistered(shortcut) {
        return this.#handlers.has(shortcut);
    }

    vfunc_key_press_event(event) {
        this.#startWaitingForInputTimer();

        const eventKeyval = event.get_key_symbol();

        if (this.#ignoreKeyval(eventKeyval)) {
            return Clutter.EVENT_STOP;
        }

        for (
            let i = this.#matchingMultiStageShortcuts.length - 1;
            i >= 0;
            i--
        ) {
            const matchingMultiStageShortcut =
                this.#matchingMultiStageShortcuts[i];
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
                    this.#finish();
                    matchingMultiStageShortcut.handler();

                    return Clutter.EVENT_STOP;
                }
            } else {
                this.#matchingMultiStageShortcuts.splice(i, 1);
            }
        }

        if (this.#matchingMultiStageShortcuts.length === 0) {
            this.#finish(INVALID_KEY_SEQUENCE_STATUS_LABEL);
        }

        return Clutter.EVENT_STOP;
    }

    #finish(error = "") {
        if (this.#grab) {
            Main.popModal(this.#grab);
            this.#grab = null;
        }

        this.#matchingMultiStageShortcuts = [];

        if (this._waitingForInputTimer) {
            Timeouts.remove(this._waitingForInputTimer);
            this._waitingForInputTimer = 0;
        }

        if (error) {
            this.#statusLabel.show();
            this.#statusLabel.text = error;
            this._statusLabelHideTimer = Timeouts.add({
                interval: 1500,
                fn: () => {
                    this._statusLabelHideTimer = 0;
                    this.#statusLabel.hide();

                    return GLib.SOURCE_REMOVE;
                },
            });
        } else {
            this.#statusLabel.hide();
        }

        this.hide();
    }

    #ignoreKeyval(keyval) {
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

    #startWaitingForInputTimer() {
        this._waitingForInputTimer = Timeouts.add({
            name: "shell/shortcuts.js/MultiStageShortcutManager/_startWaitingForInputTimer",
            interval: 3000,
            fn: () => {
                this._waitingForInputTimer = 0;
                this.#finish(NO_INPUT_STATUS_LABEL);

                return GLib.SOURCE_REMOVE;
            },
        });
    }
}

export { disable, enable, SINGLETON as Shortcuts };
