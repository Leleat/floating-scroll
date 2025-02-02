import { type Settings } from "./settings.js";

let MODULE: DebugModule = null!;

const DebugLevel = Object.freeze({
    DEBUG: 100,
    WARN: 200,
    TRACE: 300,
    ERROR: 400,
    OFF: 1000,
});
const AnsiEscSeq = Object.freeze({
    Black: "\x1b[30m",
    Red: "\x1b[31m",
    Green: "\x1b[32m",
    Yellow: "\x1b[33m",
    Blue: "\x1b[34m",
    Magenta: "\x1b[35m",
    Cyan: "\x1b[36m",
    White: "\x1b[37m",
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

    log(...data: unknown[]) {
        if (this.debugLevel <= DebugLevel.DEBUG) {
            console.log(this.prefix, ...data);
        }
    }

    warn(...data: unknown[]) {
        if (this.debugLevel <= DebugLevel.WARN) {
            console.warn(this.prefix, ...data);
        }
    }

    trace(...data: unknown[]) {
        if (this.debugLevel <= DebugLevel.TRACE) {
            console.trace(this.prefix, ...data);
        }
    }

    error(...data: unknown[]) {
        if (this.debugLevel <= DebugLevel.ERROR) {
            console.error(this.prefix, ...data);
        }
    }
}

function decorateFnWithLog(
    fn: "log" | "warn" | "trace" | "error",
    klass: string,
    options: {
        args?: boolean;
        returnVal?: boolean;
        color?: keyof typeof AnsiEscSeq;
    } = {
        args: false,
        returnVal: false,
    },
) {
    return function (
        target: unknown,
        key: string,
        descriptor: PropertyDescriptor,
    ) {
        const originalMethod = descriptor.value;

        descriptor.value = function (...args: unknown[]) {
            const logger = MODULE[fn].bind(MODULE);
            const color = options.color ? AnsiEscSeq[options.color] : "";

            logger(
                `${color}${klass}::${key}${options.args ? ` with: ${args}` : ""}`,
            );

            const result = originalMethod.apply(this, args);

            logger(
                `${color}/ ${klass}::${key}${options.returnVal ? ` returns: ${result}` : ""}`,
            );

            return result;
        };

        return descriptor;
    };
}

export { disable, enable, DebugLevel, MODULE as Debug, decorateFnWithLog };
