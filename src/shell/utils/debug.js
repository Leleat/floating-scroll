/** @type {DebugModule} */
let MODULE = null;

const LogLevel = Object.freeze({
    DEBUG: 100,
    WARN: 200,
    TRACE: 300,
    ERROR: 400,
    OFF: 1000,
});

/**
 * @param {Settings} settings
 */
function enable(settings) {
    MODULE = new DebugModule({ settings });
}

function disable() {
    MODULE.destroy();
    MODULE = null;
}

class DebugModule {
    #logLevel = LogLevel.OFF;

    /**
     * @param {object} param
     * @param {Settings} param.settings
     */
    constructor({ settings }) {
        settings.watch(
            "log-level",
            () => (this.#logLevel = settings.getLogLevel()),
            { tracker: this, immediate: true },
        );
    }

    destroy() {}

    /**
     * @param {boolean} condition
     * @param {string} message
     *
     * @throws {Error} If the condition is not met.
     */
    assert(condition, message = "") {
        if (!condition) {
            throw new Error(`Assertion failed. ${message}`);
        }
    }

    /**
     * @returns {DebugModule}
     */
    indentLog() {
        console.group();

        return this;
    }

    /**
     * @returns {DebugModule}
     */
    dedentLog() {
        console.groupEnd();

        return this;
    }

    /**
     * @param {...any} data
     *
     * @returns {DebugModule}
     */
    log(...data) {
        if (this.#logLevel <= LogLevel.DEBUG) {
            console.log(...data);
        }

        return this;
    }

    /**
     * @param {...any} data
     *
     * @returns {DebugModule}
     */
    warn(...data) {
        if (this.#logLevel <= LogLevel.WARN) {
            console.warn(...data);
        }

        return this;
    }

    /**
     * @param {...any} data
     *
     * @returns {DebugModule}
     */
    trace(...data) {
        if (this.#logLevel <= LogLevel.TRACE) {
            console.trace(...data);
        }

        return this;
    }

    /**
     * @param {...any} data
     *
     * @returns {DebugModule}
     */
    error(...data) {
        if (this.#logLevel <= LogLevel.ERROR) {
            console.error(...data);
        }

        return this;
    }
}

export { disable, enable, MODULE as Debug };
