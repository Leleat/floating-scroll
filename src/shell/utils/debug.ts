import { type Settings } from "./settings.js";

let MODULE: DebugModule = null!;

const DebugLevel = Object.freeze({
    DEBUG: 100,
    WARN: 200,
    TRACE: 300,
    ERROR: 400,
    OFF: 1000,
});

type DebugLevel = (typeof DebugLevel)[keyof typeof DebugLevel];

/**
 * @param settings
 */
function enable(settings: typeof Settings, prefix?: string) {
    MODULE = new DebugModule({ settings, prefix });
}

function disable() {
    MODULE.destroy();
    MODULE = null!;
}

class DebugModule {
    private debugLevel!: DebugLevel;
    private prefix: string;

    constructor({
        settings,
        prefix = "",
    }: {
        settings: typeof Settings;
        prefix?: string;
    }) {
        settings.watch(
            "debug-level",
            () => (this.debugLevel = settings.getDebugLevel()),
            { tracker: this, immediate: true },
        );

        this.prefix = prefix;
    }

    destroy() {}

    /**
     * @param condition
     * @param message
     * @param debugLevel
     *
     * @throws {Error} If the condition is not met.
     */
    assert(
        condition: boolean,
        message = "",
        debugLevel = DebugLevel.DEBUG,
    ): asserts condition {
        if (this.debugLevel <= debugLevel && !condition) {
            throw new Error(
                `${this.prefix ? this.prefix + " " : ""}Assertion failed. ${message}`,
            );
        }
    }

    /**
     * @param data
     *
     * @returns self
     */
    log(...data: unknown[]): DebugModule {
        if (this.debugLevel <= DebugLevel.DEBUG) {
            console.log(this.prefix, ...data);
        }

        return this;
    }

    /**
     * @param data
     *
     * @returns self
     */
    warn(...data: unknown[]): DebugModule {
        if (this.debugLevel <= DebugLevel.WARN) {
            console.warn(this.prefix, ...data);
        }

        return this;
    }

    /**
     * @param data
     *
     * @returns self
     */
    trace(...data: unknown[]): DebugModule {
        if (this.debugLevel <= DebugLevel.TRACE) {
            console.trace(this.prefix, ...data);
        }

        return this;
    }

    /**
     * @param data
     *
     * @returns self
     */
    error(...data: unknown[]): DebugModule {
        if (this.debugLevel <= DebugLevel.ERROR) {
            console.error(this.prefix, ...data);
        }

        return this;
    }
}

export { disable, enable, DebugLevel, MODULE as Debug };
