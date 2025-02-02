import { Result } from "../../shared.js";
import { GLib, Meta } from "../dependencies.js";

import { Shortcuts } from "../utils/shortcuts.js";
import { Timeouts } from "../utils/timeouts.js";
import { WorkspaceModel } from "./workspaceModel.js";
import { WorkspaceModelManager } from "./workspaceModelManager.js";

class EventGenerator {
    private subs: Map<object, ((e: Event) => void)[]> = new Map();
    private queue: Event[] = [];
    private queueIsProcessing = false;

    constructor() {
        this.initializeExistingWindows();

        global.display.connectObject(
            "window-created",
            (_: Meta.Display, win: Meta.Window) => this.onWindowCreated(win),
            "notify::focus-window",
            () => this.onFocusWindowChanged(),
            this,
        );

        Shortcuts.register({
            key: "move-focus-left",
            handler: () => {
                this.generateEvent(new MoveFocusLeftShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-focus-right",
            handler: () => {
                this.generateEvent(new MoveFocusRightShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-focus-up",
            handler: () => {
                this.generateEvent(new MoveFocusUpShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-focus-down",
            handler: () => {
                this.generateEvent(new MoveFocusDownShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-column-up",
            handler: () => {
                this.generateEvent(new MoveColumnUpShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-column-down",
            handler: () => {
                this.generateEvent(new MoveColumnDownShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-column-left",
            handler: () => {
                this.generateEvent(new MoveColumnLeftShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-column-right",
            handler: () => {
                this.generateEvent(new MoveColumnRightShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-item-up",
            handler: () => {
                this.generateEvent(new MoveItemUpShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-item-down",
            handler: () => {
                this.generateEvent(new MoveItemDownShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-item-left",
            handler: () => {
                this.generateEvent(new MoveItemLeftShortcutEvent());
            },
        });
        Shortcuts.register({
            key: "move-item-right",
            handler: () => {
                this.generateEvent(new MoveItemRightShortcutEvent());
            },
        });
    }

    destroy() {
        global.display.disconnectObject(this);
        global.get_window_actors().forEach((a) => {
            a.disconnectObject(this);
        });

        this.subs.clear();
    }

    sub(subscriber: object, callback: (event: Event) => void) {
        if (this.subs.has(subscriber)) {
            this.subs.get(subscriber)!.push(callback);
        } else {
            this.subs.set(subscriber, [callback]);
        }
    }

    unsub(subscriber: object) {
        this.subs.delete(subscriber);
    }

    private initializeExistingWindows() {
        global.get_window_actors().forEach((windowActor) => {
            const window = windowActor.get_meta_window() as Meta.Window;

            window.connectObject(
                "unmanaging",
                (w: Meta.Window) => this.onWindowUnmanaging(w),
                this,
            );

            this.generateEvent(new WindowOpenedEvent({ window }));
        });
    }

    private generateEvent(event: Event) {
        this.queue.push(event);

        if (this.queueIsProcessing) {
            return;
        }

        this.queueIsProcessing = true;

        // TODO check if this is neccecary
        Timeouts.add({
            interval: 0,
            priority: GLib.PRIORITY_DEFAULT_IDLE,
            fn: () => {
                const event = this.queue.shift();

                if (event === undefined) {
                    this.queueIsProcessing = false;

                    return GLib.SOURCE_REMOVE;
                }

                this.subs.forEach((callbacks) => {
                    callbacks.forEach((callback) => {
                        callback(event);
                    });
                });

                return GLib.SOURCE_CONTINUE;
            },
        });
    }

    private onWindowCreated(window: Meta.Window) {
        if (window.get_window_type() !== Meta.WindowType.NORMAL) {
            return;
        }

        const windowActor = window.get_compositor_private();

        windowActor.connectObject(
            "first-frame",
            (actor: Meta.WindowActor) => this.onWindowActorFirstFrame(actor),
            this,
        );

        window.connectObject(
            "unmanaging",
            (w: Meta.Window) => this.onWindowUnmanaging(w),
            this,
        );
    }

    private onFocusWindowChanged() {
        const window = global.display.focus_window;

        if (window === null) {
            return;
        }

        if (!window.isTrackedByFloatingScroll) {
            return;
        }

        this.generateEvent(new WindowFocusedEvent({ window }));
    }

    private onWindowActorFirstFrame(windowActor: Meta.WindowActor) {
        const window = windowActor.get_meta_window() as Meta.Window;

        this.generateEvent(new WindowOpenedEvent({ window }));

        window.isTrackedByFloatingScroll = true;
    }

    private onWindowUnmanaging(window: Meta.Window) {
        this.generateEvent(new WindowClosedEvent({ window }));
    }
}

class EventProcessor {
    private records: Event[] = [];

    destroy() {
        this.records = [];
    }

    processEvent(event: Event) {
        if (this.records.length > 10) {
            this.flushRecords();
        }

        this.records.push(event);

        return event.process();
    }

    private flushRecords() {
        this.records = [];
    }
}

interface Event {
    type: string;
    process(): Result<WorkspaceModel>;
}

class WindowOpenedEvent implements Event {
    type = "WindowOpenedEvent";

    private readonly window: Meta.Window;

    constructor({ window }: { window: Meta.Window }) {
        this.window = window;
    }

    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().insertWindow(
            this.window,
        );
    }
}

class WindowClosedEvent implements Event {
    type = "WindowClosedEvent";

    private readonly window: Meta.Window;

    constructor({ window }: { window: Meta.Window }) {
        this.window = window;
    }

    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().removeWindow(
            this.window,
            global.display.focus_window,
        );
    }
}

class WindowFocusedEvent implements Event {
    type = "WindowFocusedEvent";

    private readonly window: Meta.Window;

    constructor({ window }: { window: Meta.Window }) {
        this.window = window;
    }

    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().relayout(
            this.window,
        );
    }
}

class MoveFocusLeftShortcutEvent implements Event {
    type = "MoveFocusLeftShortcutEvent";

    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().focusItemOnLeft();
    }
}

class MoveFocusRightShortcutEvent implements Event {
    type = "MoveFocusRightShortcutEvent";

    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().focusItemOnRight();
    }
}

class MoveFocusUpShortcutEvent implements Event {
    type = "MoveFocusUpShortcutEvent";

    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().focusItemAbove();
    }
}

class MoveFocusDownShortcutEvent implements Event {
    type = "MoveFocusDownShortcutEvent";

    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().focusItemBelow();
    }
}

class MoveColumnUpShortcutEvent implements Event {
    type = "MoveColumnUpShortcutEvent";

    process(): Result<WorkspaceModel> {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedColumnUp();
    }
}

class MoveColumnDownShortcutEvent implements Event {
    type = "MoveColumnDownShortcutEvent";

    process(): Result<WorkspaceModel> {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedColumnDown();
    }
}

class MoveColumnLeftShortcutEvent implements Event {
    type = "MoveColumnLeftShortcutEvent";

    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedColumnLeft();
    }
}

class MoveColumnRightShortcutEvent implements Event {
    type = "MoveColumnRightShortcutEvent";

    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedColumnRight();
    }
}

class MoveItemUpShortcutEvent implements Event {
    type = "MoveItemUpShortcutEvent";

    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedItemUp();
    }
}

class MoveItemDownShortcutEvent implements Event {
    type = "MoveItemDownShortcutEvent";

    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedItemDown();
    }
}

class MoveItemLeftShortcutEvent implements Event {
    type = "MoveItemLeftShortcutEvent";

    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedItemLeft();
    }
}

class MoveItemRightShortcutEvent implements Event {
    type = "MoveItemRightShortcutEvent";

    process() {
        return WorkspaceModelManager.getActiveWorkspaceModel().moveFocusedItemRight();
    }
}

export { type Event, EventGenerator, EventProcessor };
