import { Extension, Gio, GLib } from "../dependencies.js";

/**
 * @type {Settings}
 */
let SINGLETON = null;

function enable() {
    SINGLETON = new Settings();
}

function disable() {
    SINGLETON.destroy();
    SINGLETON = null;
}

/**
 * A utility class that exposes gsettings via getter and setter methods for
 * easier 'typing'. Additionally, the class allows to `watch` for gsettings
 * changes, and to `override` GNOME's native gsettings. When the extension gets
 * disabled, this class removes the watchers, and overrides.
 */
class Settings {
    /**
     * @type {boolean} determines if the settings overrides have been properly
     * reverted via the extensions `disable` the last time the extension was
     * enabled. There are circumstances, when an extension's `disable` method
     * isn't called e. g. when the system shuts down or when gnome-shell crashes.
     */
    #didntRevertPreviously;

    /** @type {Gio.Settings} */
    #gioObject = Extension.lookupByURL(import.meta.url).getSettings();

    /**
     * @type {Map<string, Map<string, GLib.Variant>>} saves the native settings
     * that have been overridden in the extensions `enable` call. The key is the
     * schema_id of the overridden Gio.Settings. The value is a Map of the
     * overridden key and the settings old value.
     */
    #runtimeOverriddes = new Map();

    /** @type {number[]} */
    #watchIds = [];

    /** @type {WeakMap<object, number[]>} */
    #watchTrackers = new WeakMap();

    constructor() {
        this.#didntRevertPreviously =
            this.#gioObject.get_user_value("overridden-settings") !== null;
    }

    destroy() {
        this.#clearOverriddenSettings();

        this.#watchIds.forEach((id) => this.#gioObject.disconnect(id));
        this.#watchIds = [];

        this.#watchTrackers = new WeakMap();

        this.#gioObject = null;
    }

    /**
     * Overrides GNOME's native settings and restores them on `disable()`.
     *
     * @param {Gio.Settings} settings
     * @param {string} key
     * @param {GLib.Variant} newValue
     */
    override(settings, key, newValue) {
        const schemaId = settings.schema_id;
        const userValue = settings.get_user_value(key);
        const oldSettingsMap = this.#runtimeOverriddes.get(schemaId);

        if (oldSettingsMap) {
            oldSettingsMap.set(key, userValue);
        } else {
            this.#runtimeOverriddes.set(schemaId, new Map([[key, userValue]]));
        }

        this.#updateBackupOverrides(schemaId, key, userValue);
        settings.set_value(key, newValue);
    }

    /**
     * @param {SettingsKey} key
     * @param {Function} fn
     * @param {object} param
     * @param {object} [param.tracker]
     * @param {boolean} [param.immediate]
     *
     * @returns {number}
     */
    watch(key, fn, { tracker = null, immediate = false } = {}) {
        const id = this.#gioObject.connect(`changed::${key}`, () =>
            fn(this, key),
        );

        if (immediate) {
            fn(this, key);
        }

        this.#watchIds.push(id);

        if (tracker) {
            const trackedIds = this.#watchTrackers.get(tracker) ?? [];

            trackedIds.push(id);
            this.#watchTrackers.set(tracker, trackedIds);
        }

        return id;
    }

    /**
     * @param {number|object} idOrTracker - if a number, disconnect only that
     *      signal. If it's an object, disconnect all signals associated with
     *      that object.
     */
    unwatch(idOrTracker) {
        if (typeof idOrTracker === "number") {
            const id = idOrTracker;

            if (!this.#watchIds.includes(id)) {
                return;
            }

            this.#gioObject.disconnect(id);
            this.#watchIds = this.#watchIds.filter((i) => i !== id);
        } else {
            const tracker = idOrTracker;
            const trackedIds = this.#watchTrackers.get(tracker);

            if (!trackedIds) {
                return;
            }

            // TODO: It's possible that we track ids in the WeakMap that have
            // been disconnected via `unwatch(id)`. Since we can't iterate over
            // the WeakMap, we can't remove the ids from the tracked arrays.
            // It's not a big deal, since disconnecting an already disconnected
            // signal only logs a warning... not ideal, but better than having
            // a strong reference to an object that may have been destroyed or
            // where the Settings singleton keeps the tracker obj from being
            // gc'd cause you forgot to call `unwatch` on it.
            trackedIds.forEach((id) => this.#gioObject.disconnect(id));

            this.#watchTrackers.delete(tracker);
            this.#watchIds = this.#watchIds.filter(
                (id) => !trackedIds.includes(id),
            );
        }
    }

    #clearOverriddenSettings() {
        if (this.#didntRevertPreviously) {
            const previouslySavedSettings = this.#gioObject
                .get_value("overridden-settings")
                .unpack();

            Object.entries(previouslySavedSettings).forEach(([path, value]) => {
                const splits = path.split(".");
                const key = splits.at(-1);
                const schemaId = splits.slice(0, -1).join(".");
                const gobject = new Gio.Settings({ schema_id: schemaId });
                const variant = value.get_variant();

                if (
                    variant.equal(
                        GLib.Variant.new_maybe(new GLib.VariantType("b"), null),
                    )
                ) {
                    gobject.reset(key);
                } else {
                    gobject.set_value(key, variant);
                }
            });
        } else {
            this.#runtimeOverriddes.forEach((overrides, schemaId) => {
                const gobject = new Gio.Settings({ schema_id: schemaId });

                overrides.forEach((value, key) => {
                    if (value) {
                        gobject.set_value(key, value);
                    } else {
                        gobject.reset(key);
                    }
                });
            });
        }

        this.#gioObject.reset("overridden-settings");
        this.#runtimeOverriddes.clear();
    }

    #updateBackupOverrides(schemaId, key, newValue) {
        if (this.#didntRevertPreviously) {
            return;
        }

        const savedSettings = this.#gioObject
            .get_value("overridden-settings")
            .deepUnpack();
        const prefKey = `${schemaId}.${key}`;

        savedSettings[prefKey] =
            newValue ?? GLib.Variant.new_maybe(new GLib.VariantType("b"), null);

        this.#gioObject.set_value(
            "overridden-settings",
            new GLib.Variant("a{sv}", savedSettings),
        );
    }

    /***************************************************************************
     * Getters *****************************************************************
     **************************************************************************/

    /** @returns {Gio.Settings} */
    getGioObject() {
        return this.#gioObject;
    }

    /** @returns {number} */
    getFocusBehaviorMainAxis() {
        return this.#gioObject.get_enum("focus-behavior-main-axis");
    }

    /** @returns {number} */
    getFocusBehaviorCrossAxis() {
        return this.#gioObject.get_enum("focus-behavior-cross-axis");
    }

    /** @returns {number} */
    getDebugLevel() {
        return this.#gioObject.get_enum("debug-level");
    }

    /** @returns {number} */
    getWindowOpeningPosition() {
        return this.#gioObject.get_enum("window-opening-position");
    }

    /***************************************************************************
     * Setters *****************************************************************
     **************************************************************************/
}

export { disable, enable, SINGLETON as Settings };
