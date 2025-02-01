import {
    SettingsKey,
    ShortcutKey,
    WindowOpeningPosition,
} from "../../shared.js";
import { Extension, Gio, GLib } from "../dependencies.js";
import { type DebugLevel } from "./debug.js";

let SINGLETON: Settings = null!;

function enable() {
    SINGLETON = new Settings();
}

function disable() {
    SINGLETON.destroy();
    SINGLETON = null!;
}

/**
 * A utility class that exposes gsettings via getter and setter methods for
 * easier 'typing'. Additionally, the class allows to `watch` for gsettings
 * changes, and to `override` GNOME's native gsettings. When the extension gets
 * disabled, this class removes the watchers, and overrides.
 */
class Settings {
    /**
     * determines if the settings overrides have been properly
     * reverted via the extensions `disable` the last time the extension was
     * enabled. There are circumstances, when an extension's `disable` method
     * isn't called e. g. when the system shuts down or when gnome-shell crashes.
     */
    private didntRevertPreviously = false;

    private gioObject: Gio.Settings = Extension.lookupByURL(
        import.meta.url,
    )!.getSettings();

    /**
     * saves the native settings that have been overridden in the extensions
     * `enable` call. The key is the schema_id of the overridden Gio.Settings.
     * The value is a Map of the overridden key and the settings old value.
     */
    private runtimeOverriddes: Map<string, Map<string, GLib.Variant>> =
        new Map();

    private watchIds: number[] = [];

    private watchTrackers: WeakMap<object, number[]> = new WeakMap();

    constructor() {
        this.didntRevertPreviously =
            this.gioObject.get_user_value("overridden-settings") !== null;
    }

    destroy() {
        this.clearOverriddenSettings();

        this.watchIds.forEach((id) => this.gioObject.disconnect(id));
        this.watchIds = [];

        this.watchTrackers = new WeakMap();

        this.gioObject = null!;
    }

    /**
     * Overrides GNOME's native settings and restores them on `disable()`.
     *
     * @param settings
     * @param key
     * @param newValue
     */
    override(settings: Gio.Settings, key: string, newValue: GLib.Variant) {
        const schemaId = settings.schema_id;
        // `userValue` may be null, which is valid but seems to be a problem for
        // the type definitions. So we cast it and disable eslint for that line.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userValue = settings.get_user_value(key) as GLib.Variant<any>;
        const oldSettingsMap = this.runtimeOverriddes.get(schemaId);

        if (oldSettingsMap) {
            oldSettingsMap.set(key, userValue);
        } else {
            this.runtimeOverriddes.set(schemaId, new Map([[key, userValue]]));
        }

        this.updateBackupOverrides(schemaId, key, userValue);
        settings.set_value(key, newValue);
    }

    watch(
        key: SettingsKey | ShortcutKey,
        fn: (s: Settings, key: string) => unknown,
        {
            tracker,
            immediate = false,
        }: { tracker?: object; immediate?: boolean } = {},
    ): number {
        const id = this.gioObject.connect(`changed::${key}`, () =>
            fn(this, key),
        );

        if (immediate) {
            fn(this, key);
        }

        this.watchIds.push(id);

        if (tracker) {
            const trackedIds = this.watchTrackers.get(tracker) ?? [];

            trackedIds.push(id);
            this.watchTrackers.set(tracker, trackedIds);
        }

        return id;
    }

    /**
     * @param idOrTracker - if a number, disconnect only that
     *      signal. If it's an object, disconnect all signals associated with
     *      that object.
     */
    unwatch(idOrTracker: number | object) {
        if (typeof idOrTracker === "number") {
            const id = idOrTracker;

            if (!this.watchIds.includes(id)) {
                return;
            }

            this.gioObject.disconnect(id);
            this.watchIds = this.watchIds.filter((i) => i !== id);
        } else {
            const trackerObj = idOrTracker;
            const trackedIds = this.watchTrackers.get(trackerObj);

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
            trackedIds.forEach((id) => this.gioObject.disconnect(id));

            this.watchTrackers.delete(trackerObj);
            this.watchIds = this.watchIds.filter(
                (id) => !trackedIds.includes(id),
            );
        }
    }

    private clearOverriddenSettings() {
        if (this.didntRevertPreviously) {
            const previouslySavedSettings = this.gioObject
                .get_value("overridden-settings")
                .unpack() as Record<string, GLib.Variant>;

            Object.entries(previouslySavedSettings).forEach(([path, value]) => {
                const splits = path.split(".");
                const key = splits.at(-1) as string;
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
            this.runtimeOverriddes.forEach((overrides, schemaId) => {
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

        this.gioObject.reset("overridden-settings");
        this.runtimeOverriddes.clear();
    }

    private updateBackupOverrides(
        schemaId: string,
        key: string,
        newValue: GLib.Variant,
    ) {
        if (this.didntRevertPreviously) {
            return;
        }

        const savedSettings = this.gioObject
            .get_value("overridden-settings")
            .deepUnpack() as Record<string, GLib.Variant>;
        const prefKey = `${schemaId}.${key}`;

        savedSettings[prefKey] =
            newValue ?? GLib.Variant.new_maybe(new GLib.VariantType("b"), null);

        this.gioObject.set_value(
            "overridden-settings",
            new GLib.Variant("a{sv}", savedSettings),
        );
    }

    /***************************************************************************
     * Getters *****************************************************************
     **************************************************************************/

    getGioObject() {
        return this.gioObject;
    }

    getFocusBehaviorMainAxis() {
        return this.gioObject.get_enum("focus-behavior-main-axis");
    }

    getFocusBehaviorCrossAxis() {
        return this.gioObject.get_enum("focus-behavior-cross-axis");
    }

    getDebugLevel() {
        return this.gioObject.get_enum("debug-level") as DebugLevel;
    }

    getWindowOpeningPosition() {
        return this.gioObject.get_enum(
            "window-opening-position",
        ) as WindowOpeningPosition;
    }

    /***************************************************************************
     * Setters *****************************************************************
     **************************************************************************/
}

export { disable, enable, SINGLETON as Settings };
