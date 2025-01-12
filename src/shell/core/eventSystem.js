import { GLib, Meta } from "../dependencies.js";

import { Debug } from "../utils/debug.js";
import { Settings } from "../utils/settings.js";
import { Shortcuts } from "../utils/shortcuts.js";
import { Timeouts } from "../utils/timeouts.js";
import { WorkspaceModelManager } from "./workspaceModelManager.js";

class EventGenerator {
    /** @type {Map<object, Function[]>} */
    #subs = new Map();

    /** @type {Event[]} */
    #queue = [];
    #queueIsProcessing = false;

    constructor() {
        this.#initializeExistingWindows();

        global.display.connectObject(
            "window-created",
            (_, win) => this.#onWindowCreated(win),
            "notify::focus-window",
            () => this.#onFocusWindowChanged(),
            this,
        );

        Shortcuts.register({
            key: "move-focus-left",
            handler: () => {
                this.#generateEvent(new MoveFocusLeftShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-focus-right",
            handler: () => {
                this.#generateEvent(new MoveFocusRightShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-focus-up",
            handler: () => {
                this.#generateEvent(new MoveFocusUpShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-focus-down",
            handler: () => {
                this.#generateEvent(new MoveFocusDownShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-column-up",
            handler: () => {
                this.#generateEvent(new MoveColumnUpShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-column-down",
            handler: () => {
                this.#generateEvent(new MoveColumnDownShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-column-left",
            handler: () => {
                this.#generateEvent(new MoveColumnLeftShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-column-right",
            handler: () => {
                this.#generateEvent(new MoveColumnRightShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-item-up",
            handler: () => {
                this.#generateEvent(new MoveItemUpShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-item-down",
            handler: () => {
                this.#generateEvent(new MoveItemDownShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-item-left",
            handler: () => {
                this.#generateEvent(new MoveItemLeftShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-item-right",
            handler: () => {
                this.#generateEvent(new MoveItemRightShortcutEvent());
            },
        });
    }

    destroy() {
        global.display.disconnectObject(this);
        global.get_window_actors().forEach((a) => {
            a.disconnectObject(this);
        });

        this.#subs.clear();
    }

    sub(subscriber, ...callbacks) {
        if (this.#subs.has(subscriber)) {
            this.#subs.get(subscriber).push(callbacks);
        } else {
            this.#subs.set(subscriber, callbacks);
        }
    }

    unsub(subscriber) {
        this.#subs.delete(subscriber);
    }

    #initializeExistingWindows() {
        global.get_window_actors().forEach((windowActor) => {
            const window = windowActor.get_meta_window();

            window.connectObject(
                "unmanaging",
                (w) => this.#onWindowUnmanaging(w),
                this,
            );

            this.#generateEvent(new WindowOpenedEvent({ window }));
        });
    }

    /**
     * @param {Event} event
     */
    #generateEvent(event) {
        this.#queue.push(event);

        if (this.#queueIsProcessing) {
            return;
        }

        this.#queueIsProcessing = true;

        // TODO check if this is neccecary
        Timeouts.add({
            interval: 0,
            priority: GLib.PRIORITY_DEFAULT_IDLE,
            fn: () => {
                const event = this.#queue.shift();

                if (event === undefined) {
                    this.#queueIsProcessing = false;

                    return GLib.SOURCE_REMOVE;
                }

                this.#subs.forEach((callbacks) => {
                    callbacks.forEach((callback) => {
                        callback(event);
                    });
                });

                return GLib.SOURCE_CONTINUE;
            },
        });
    }

    /**
     * @param {Meta.Window} window
     */
    #onWindowCreated(window) {
        if (window.get_window_type() !== Meta.WindowType.NORMAL) {
            return;
        }

        const windowActor = window.get_compositor_private();

        windowActor.connectObject(
            "first-frame",
            (actor) => this.#onWindowActorFirstFrame(actor),
            this,
        );

        window.connectObject(
            "unmanaging",
            (w) => this.#onWindowUnmanaging(w),
            this,
        );
    }

    #onFocusWindowChanged() {
        const window = global.display.focus_window;

        if (window === null) {
            return;
        }

        if (!window.isTrackedByFloatingScroll) {
            return;
        }

        Debug.log("Focus changed", window?.get_wm_class()).indentLog();
        this.#generateEvent(new WindowFocusedEvent({ window }));
        Debug.dedentLog();
    }

    #onWindowActorFirstFrame(windowActor) {
        const window = windowActor.get_meta_window();

        Debug.log("First frame", window.get_wm_class()).indentLog();
        this.#generateEvent(new WindowOpenedEvent({ window }));
        Debug.dedentLog();

        window.isTrackedByFloatingScroll = true;
    }

    #onWindowUnmanaging(window) {
        Debug.log("Unmanaging", window.get_wm_class()).indentLog();
        this.#generateEvent(new WindowClosedEvent({ window }));
        Debug.dedentLog();
    }
}

class EventProcessor {
    /** @type {Event} */
    #records = [];

    destroy() {
        this.#records = [];
    }

    /**
     * @param {Event} event
     *
     * @returns {import("./workspaceModel.js").WorkspaceModelChangeResult}
     */
    processEvent(event) {
        if (this.#records.length > 10) {
            this.#flushRecords();
        }

        this.#records.push(event);

        return event.process();
    }

    #flushRecords() {
        this.#records = [];
    }
}

class Event {
    type = "Event";

    /**
     * @param {object} data
     *
     * @returns {import("./workspaceModel.js").WorkspaceModelChangeResult}
     */
    process(data) {
        throw new Error(`Not implemented: ${data}`);
    }
}

class WindowOpenedEvent extends Event {
    type = "WindowOpenedEvent";

    #data = null;

    constructor(data) {
        super();

        this.#data = data;
    }

    /**
     * @returns {import("./workspaceModel.js").WorkspaceModelChangeResult}
     */
    process() {
        const { window } = this.#data;
        const workspaceModel = WorkspaceModelManager.getActiveWorkspaceModel();
        const result = workspaceModel.insertWindow(
            window,
            Settings.getWindowOpeningPosition(),
        );

        Debug.assert(result.ok, "Failed to insert window");

        return result;
    }
}

class WindowClosedEvent extends Event {
    type = "WindowClosedEvent";

    #data = null;

    constructor(data) {
        super();

        this.#data = data;
    }

    /**
     * @returns {import("./workspaceModel.js").WorkspaceModelChangeResult}
     */
    process() {
        const { window } = this.#data;
        const workspaceModel = WorkspaceModelManager.getActiveWorkspaceModel();
        const result = workspaceModel.removeWindow(
            window,
            global.display.focus_window,
        );

        Debug.assert(result.ok, "Failed to remove window");

        return result;
    }
}

class WindowFocusedEvent extends Event {
    type = "WindowFocusedEvent";

    #data = null;

    constructor(data) {
        super();

        this.#data = data;
    }

    /**
     * @returns {import("./workspaceModel.js").WorkspaceModelChangeResult}
     */
    process() {
        const { window } = this.#data;
        const workspaceModel = WorkspaceModelManager.getActiveWorkspaceModel();
        const result = workspaceModel.relayout(window);

        Debug.assert(result.ok, "Failed to relayout");

        return result;
    }
}

class MoveFocusLeftShortcutEvent extends Event {
    type = "MoveFocusLeftShortcutEvent";

    /**
     * @returns {{ok: false}}
     */
    process() {
        WorkspaceModelManager.getActiveWorkspaceModel()
            .getItemOnLeftOfFocus()
            ?.focus(global.get_current_time());

        return { ok: false };
    }
}

class MoveFocusRightShortcutEvent extends Event {
    type = "MoveFocusRightShortcutEvent";

    /**
     * @returns {{ok: false}}
     */
    process() {
        WorkspaceModelManager.getActiveWorkspaceModel()
            .getItemOnRightOfFocus()
            ?.focus(global.get_current_time());

        return { ok: false };
    }
}

class MoveFocusUpShortcutEvent extends Event {
    type = "MoveFocusUpShortcutEvent";

    /**
     * @returns {{ok: false}}
     */
    process() {
        WorkspaceModelManager.getActiveWorkspaceModel()
            .getItemAboveFocus()
            ?.focus(global.get_current_time());

        return { ok: false };
    }
}

class MoveFocusDownShortcutEvent extends Event {
    type = "MoveFocusDownShortcutEvent";

    /**
     * @returns {{ok: false}}
     */
    process() {
        WorkspaceModelManager.getActiveWorkspaceModel()
            .getItemBelowFocus()
            ?.focus(global.get_current_time());

        return { ok: false };
    }
}

class MoveColumnUpShortcutEvent extends Event {
    type = "MoveColumnUpShortcutEvent";

    /**
     * @returns {import("./workspaceModel.js").WorkspaceModelChangeResult}
     */
    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedColumnUp();
    }
}

class MoveColumnDownShortcutEvent extends Event {
    type = "MoveColumnDownShortcutEvent";

    /**
     * @returns {import("./workspaceModel.js").WorkspaceModelChangeResult}
     */
    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedColumnDown();
    }
}

class MoveColumnLeftShortcutEvent extends Event {
    type = "MoveColumnLeftShortcutEvent";

    /**
     * @returns {import("./workspaceModel.js").WorkspaceModelChangeResult}
     */
    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedColumnLeft();
    }
}

class MoveColumnRightShortcutEvent extends Event {
    type = "MoveColumnRightShortcutEvent";

    /**
     * @returns {import("./workspaceModel.js").WorkspaceModelChangeResult}
     */
    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedColumnRight();
    }
}

class MoveItemUpShortcutEvent extends Event {
    type = "MoveItemUpShortcutEvent";

    /**
     * @returns {import("./workspaceModel.js").WorkspaceModelChangeResult}
     */
    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedItemUp();
    }
}

class MoveItemDownShortcutEvent extends Event {
    type = "MoveItemDownShortcutEvent";

    /**
     * @returns {import("./workspaceModel.js").WorkspaceModelChangeResult}
     */
    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedItemDown();
    }
}

class MoveItemLeftShortcutEvent extends Event {
    type = "MoveItemLeftShortcutEvent";

    /**
     * @returns {import("./workspaceModel.js").WorkspaceModelChangeResult}
     */
    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedItemLeft();
    }
}

class MoveItemRightShortcutEvent extends Event {
    type = "MoveItemRightShortcutEvent";

    /**
     * @returns {import("./workspaceModel.js").WorkspaceModelChangeResult}
     */
    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedItemRight();
    }
}

export { EventGenerator, EventProcessor };
