import { type Gio } from "./shell/dependencies.js";

export type ShortcutKey =
    | "move-focus-left"
    | "move-focus-right"
    | "move-focus-up"
    | "move-focus-down"
    | "move-column-left"
    | "move-column-right"
    | "move-column-up"
    | "move-column-down"
    | "move-item-left"
    | "move-item-right"
    | "move-item-up"
    | "move-item-down"
    | "multi-stage-shortcut-activator-0"
    | "multi-stage-shortcut-activator-1"
    | "multi-stage-shortcut-activator-2"
    | "multi-stage-shortcut-activator-3"
    | "multi-stage-shortcut-activator-4"
    | "multi-stage-shortcut-activator-5"
    | "multi-stage-shortcut-activator-6"
    | "multi-stage-shortcut-activator-7"
    | "multi-stage-shortcut-activator-8"
    | "multi-stage-shortcut-activator-9"
    | "multi-stage-shortcut-activator-10"
    | "multi-stage-shortcut-activator-11"
    | "multi-stage-shortcut-activator-12"
    | "multi-stage-shortcut-activator-13"
    | "multi-stage-shortcut-activator-14"
    | "multi-stage-shortcut-activator-15"
    | "multi-stage-shortcut-activator-16"
    | "multi-stage-shortcut-activator-17"
    | "multi-stage-shortcut-activator-18"
    | "multi-stage-shortcut-activator-19"
    | "multi-stage-shortcut-activator-20"
    | "multi-stage-shortcut-activator-21"
    | "multi-stage-shortcut-activator-22"
    | "multi-stage-shortcut-activator-23"
    | "multi-stage-shortcut-activator-24"
    | "multi-stage-shortcut-activator-25"
    | "multi-stage-shortcut-activator-26"
    | "multi-stage-shortcut-activator-27"
    | "multi-stage-shortcut-activator-28"
    | "multi-stage-shortcut-activator-29";

export type SettingsKey =
    | "overridden-settings"
    | "debug-level"
    | "focus-behavior-main-axis"
    | "focus-behavior-cross-axis"
    | "window-opening-position"
    | "window-padding"
    | "window-peeking";

/** The amount of multi-stage shortcut activators defined in the schema */
export const MULTI_STAGE_SHORTCUT_ACTIVATOR_COUNT = 30;

/**
 * @param settings
 */
export function disableMultiStageShortcutActivators(settings: Gio.Settings) {
    for (let i = 0; i < MULTI_STAGE_SHORTCUT_ACTIVATOR_COUNT; i++) {
        settings.set_strv(`multi-stage-shortcut-activator-${i}`, []);
    }
}

/**
 * @param settings
 */
export function updateMultiStageShortcutActivators(settings: Gio.Settings) {
    disableMultiStageShortcutActivators(settings);

    const savedMultiStageActivators: string[] = [];
    const keys: string[] = [];

    keys.forEach((key) => {
        const activators = settings.get_strv(key);
        const isMultiStageShortcut = activators.length > 1;

        if (!isMultiStageShortcut) {
            return;
        }

        const [primaryActivator] = activators;

        if (savedMultiStageActivators.includes(primaryActivator)) {
            return;
        }

        for (let i = 0; i < MULTI_STAGE_SHORTCUT_ACTIVATOR_COUNT; i++) {
            const multiStageActivators = settings.get_strv(
                `multi-stage-shortcut-activator-${i}`,
            );

            if (multiStageActivators.length === 0) {
                savedMultiStageActivators.push(primaryActivator);
                settings.set_strv(`multi-stage-shortcut-activator-${i}`, [
                    primaryActivator,
                ]);

                return;
            }
        }

        // TODO make this more user-friendly and turn this error into a notification
        throw new Error(
            "No more multi-stage shortcut activators available. Please report this issue on GitHub.",
        );
    });
}

export const FocusBehavior = Object.freeze({
    CENTER: 0,
    LAZY_FOLLOW: 1,
});

export type FocusBehavior = (typeof FocusBehavior)[keyof typeof FocusBehavior];

export const WindowOpeningPosition = Object.freeze({
    LEFT: 0,
    RIGHT: 1,
    BETWEEN_MRU: 2,
});

export type WindowOpeningPosition =
    (typeof WindowOpeningPosition)[keyof typeof WindowOpeningPosition];

export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export class Result<T> {
    static Ok<T>(v: T): Result<T> {
        return new Result<T>({ value: v });
    }

    static Err<T>(e: number): Result<T> {
        return new Result<T>({ error: e });
    }

    private readonly value: T | undefined;
    private readonly error: number | undefined;

    protected constructor({ value, error }: { value?: T; error?: number }) {
        if (value !== undefined) {
            this.value = value;
        } else {
            this.error = error;
        }
    }

    isErr(): this is { __value: never; __error: number } {
        return this.error !== undefined;
    }

    isOk(): this is { __value: T; __error: never } {
        return this.value !== undefined;
    }

    inspect(fn: (value: T) => void): this {
        if (this.value !== undefined) {
            fn(this.value);
        }

        return this;
    }

    inspectErr(fn: (error: number) => void): this {
        if (this.error !== undefined) {
            fn(this.error);
        }

        return this;
    }

    match<U, V>({
        ok,
        error,
    }: {
        ok: (value: T) => U;
        error: (error: number) => V;
    }): U | V {
        return this.value !== undefined ? ok(this.value) : error(this.error!);
    }

    /**
     * @throws {number}
     */
    unwrap() {
        if (this.value) {
            return this.value;
        }

        throw this.error;
    }
}
