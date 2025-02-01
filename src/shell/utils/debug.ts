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
function enable(settings: typeof Settings) {
    MODULE = new DebugModule({ settings });
}

function disable() {
    MODULE.destroy();
    MODULE = null!;
}

class DebugModule {
    private debugLevel!: DebugLevel;

    /**
     * @param param
     * @param param.settings
     */
    constructor({ settings }: { settings: typeof Settings }) {
        settings.watch(
            "debug-level",
            () => (this.debugLevel = settings.getDebugLevel()),
            { tracker: this, immediate: true },
        );
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
            throw new Error(`Assertion failed. ${message}`);
        }
    }

    indentLog(): DebugModule {
        console.group();

        return this;
    }

    dedentLog(): DebugModule {
        console.groupEnd();

        return this;
    }

    /**
     * @param data
     *
     * @returns self
     */
    log(...data: unknown[]): DebugModule {
        if (this.debugLevel <= DebugLevel.DEBUG) {
            console.log(...data);
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
            console.warn(...data);
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
            console.trace(...data);
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
            console.error(...data);
        }

        return this;
    }
}

export { disable, enable, DebugLevel, MODULE as Debug };
