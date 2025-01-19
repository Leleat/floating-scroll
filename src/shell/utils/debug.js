/** @type {DebugModule} */
let MODULE = null;

const DebugLevel = Object.freeze({
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
    /** @type {DebugLevel} */
    #debugLevel;

    /**
     * @param {object} param
     * @param {Settings} param.settings
     */
    constructor({ settings }) {
        settings.watch(
            "debug-level",
            () => (this.#debugLevel = settings.getDebugLevel()),
            { tracker: this, immediate: true },
        );
    }

    destroy() {}

    /**
     * @param {boolean} condition
     * @param {string} [message]
     * @param {number} [debugLevel]
     *
     * @throws {Error} If the condition is not met.
     */
    assert(condition, message = "", debugLevel = DebugLevel.DEBUG) {
        if (this.#debugLevel <= debugLevel && !condition) {
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
        if (this.#debugLevel <= DebugLevel.DEBUG) {
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
        if (this.#debugLevel <= DebugLevel.WARN) {
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
        if (this.#debugLevel <= DebugLevel.TRACE) {
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
        if (this.#debugLevel <= DebugLevel.ERROR) {
            console.error(...data);
        }

        return this;
    }
}

export { disable, enable, DebugLevel, MODULE as Debug };
