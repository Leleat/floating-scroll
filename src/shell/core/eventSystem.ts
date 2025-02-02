import { Result } from "../../shared.js";
import { GLib, Meta } from "../dependencies.js";

import { Shortcuts } from "../utils/shortcuts.js";
import { Timeouts } from "../utils/timeouts.js";
import { WorkspaceModel } from "./workspaceModel.js";
import { WorkspaceModelManager } from "./workspaceModelManager.js";

class EventGenerator {
    private subs: Map<object, ((e: WorkspaceChangeEvent) => void)[]> =
        new Map();
    private queue: WorkspaceChangeEvent[] = [];
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

    sub(subscriber: object, callback: (event: WorkspaceChangeEvent) => void) {
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

    private generateEvent(event: WorkspaceChangeEvent) {
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
    private records: WorkspaceChangeEvent[] = [];

    destroy() {
        this.records = null!;
    }

    processEvent(event: WorkspaceChangeEvent) {
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

interface WorkspaceChangeEvent {
    type: string;

    /**
     * Ok -> there is a new workspace model
     * Err -> there is no new workspace model
     */
    process(): Result<WorkspaceChangeEvent>;

    /**
     * @returns The new workspace model, if the event processing result is Ok.
     */
    getModel(): WorkspaceModel | undefined;
}

abstract class WorkspaceModelModificationEvent implements WorkspaceChangeEvent {
    readonly type: string;

    protected model?: WorkspaceModel;

    constructor({ type }: { type: string }) {
        this.type = type;
    }

    abstract process(): Result<WorkspaceChangeEvent>;

    getModel(): WorkspaceModel | undefined {
        return this.model;
    }
}

abstract class FocusChangeEvent implements WorkspaceChangeEvent {
    readonly type: string;
    protected model: undefined;

    constructor({ type }: { type: string }) {
        this.type = type;
    }

    // never "Ok" since we only change focus and rely on the focus
    // change event to actually modify the workspaceModel.
    abstract process(): Result<WorkspaceChangeEvent>;

    getModel() {
        return undefined;
    }
}

class WindowOpenedEvent extends WorkspaceModelModificationEvent {
    private readonly window: Meta.Window;

    constructor({ window }: { window: Meta.Window }) {
        super({ type: "WindowOpenedEvent" });
        this.window = window;
    }

    process() {
        const workspaceModel = WorkspaceModelManager.getWorkspaceModel();

        if (workspaceModel) {
            this.model = workspaceModel.insertWindow(this.window).unwrap();
        } else {
            this.model = WorkspaceModelManager.createWorkspaceModel(
                this.window,
            );
        }

        return Result.Ok<WorkspaceChangeEvent>(this);
    }
}

class WindowClosedEvent extends WorkspaceModelModificationEvent {
    private readonly window: Meta.Window;

    constructor({ window }: { window: Meta.Window }) {
        super({ type: "WindowClosedEvent" });
        this.window = window;
    }

    process() {
        const newModel =
            WorkspaceModelManager.getWorkspaceModel()!.removeWindow(
                this.window,
                global.display.focus_window,
            );

        return newModel.match({
            ok: (m) => {
                this.model = m;
                return Result.Ok<WorkspaceChangeEvent>(this);
            },
            error: (e) => Result.Err<WorkspaceChangeEvent>(e),
        });
    }
}

class WindowFocusedEvent extends WorkspaceModelModificationEvent {
    private readonly window: Meta.Window;

    constructor({ window }: { window: Meta.Window }) {
        super({ type: "WindowFocusedEvent" });
        this.window = window;
    }

    process() {
        this.model = WorkspaceModelManager.getWorkspaceModel()!
            .relayout(this.window)
            .unwrap();

        return Result.Ok<WorkspaceChangeEvent>(this);
    }
}

class MoveFocusLeftShortcutEvent extends FocusChangeEvent {
    constructor() {
        super({ type: "MoveFocusLeftShortcutEvent" });
    }

    process() {
        const model = WorkspaceModelManager.getWorkspaceModel();

        if (model) {
            return model.focusItemOnLeft().match({
                ok: () => Result.Ok<WorkspaceChangeEvent>(this),
                error: (e) => Result.Err<WorkspaceChangeEvent>(e),
            });
        } else {
            return Result.Err<WorkspaceChangeEvent>(
                "No active workspace model",
            );
        }
    }
}

class MoveFocusRightShortcutEvent extends FocusChangeEvent {
    constructor() {
        super({ type: "MoveFocusRightShortcutEvent" });
    }

    process() {
        const model = WorkspaceModelManager.getWorkspaceModel();

        if (model) {
            return model.focusItemOnRight().match({
                ok: () => Result.Ok<WorkspaceChangeEvent>(this),
                error: (e) => Result.Err<WorkspaceChangeEvent>(e),
            });
        } else {
            return Result.Err<WorkspaceChangeEvent>(
                "No active workspace model",
            );
        }
    }
}

class MoveFocusUpShortcutEvent extends FocusChangeEvent {
    constructor() {
        super({ type: "MoveFocusUpShortcutEvent" });
    }

    process() {
        const model = WorkspaceModelManager.getWorkspaceModel();

        if (model) {
            return model.focusItemAbove().match({
                ok: () => Result.Ok<WorkspaceChangeEvent>(this),
                error: (e) => Result.Err<WorkspaceChangeEvent>(e),
            });
        } else {
            return Result.Err<WorkspaceChangeEvent>(
                "No active workspace model",
            );
        }
    }
}

class MoveFocusDownShortcutEvent extends FocusChangeEvent {
    constructor() {
        super({ type: "MoveFocusDownShortcutEvent" });
    }

    process() {
        const model = WorkspaceModelManager.getWorkspaceModel();

        if (model) {
            return model.focusItemBelow().match({
                ok: () => Result.Ok<WorkspaceChangeEvent>(this),
                error: (e) => Result.Err<WorkspaceChangeEvent>(e),
            });
        } else {
            return Result.Err<WorkspaceChangeEvent>(
                "No active workspace model",
            );
        }
    }
}

class MoveColumnUpShortcutEvent extends WorkspaceModelModificationEvent {
    constructor() {
        super({ type: "MoveColumnUpShortcutEvent" });
    }

    process() {
        // TODO
        return Result.Err<WorkspaceChangeEvent>("No active workspace model");
    }
}

class MoveColumnDownShortcutEvent extends WorkspaceModelModificationEvent {
    constructor() {
        super({ type: "MoveColumnDownShortcutEvent" });
    }

    process() {
        // TODO
        return Result.Err<WorkspaceChangeEvent>("No active workspace model");
    }
}

class MoveColumnLeftShortcutEvent extends WorkspaceModelModificationEvent {
    constructor() {
        super({ type: "MoveColumnLeftShortcutEvent" });
    }

    process() {
        const model = WorkspaceModelManager.getWorkspaceModel();

        if (model) {
            return model.moveFocusedColumnLeft().match({
                ok: (m) => {
                    this.model = m;
                    return Result.Ok<WorkspaceChangeEvent>(this);
                },
                error: (e) => Result.Err<WorkspaceChangeEvent>(e),
            });
        } else {
            return Result.Err<WorkspaceChangeEvent>(
                "No active workspace model",
            );
        }
    }
}

class MoveColumnRightShortcutEvent extends WorkspaceModelModificationEvent {
    constructor() {
        super({ type: "MoveColumnRightShortcutEvent" });
    }

    process() {
        const model = WorkspaceModelManager.getWorkspaceModel();

        if (model) {
            return model.moveFocusedColumnRight().match({
                ok: (m) => {
                    this.model = m;
                    return Result.Ok<WorkspaceChangeEvent>(this);
                },
                error: (e) => Result.Err<WorkspaceChangeEvent>(e),
            });
        } else {
            return Result.Err<WorkspaceChangeEvent>(
                "No active workspace model",
            );
        }
    }
}

class MoveItemUpShortcutEvent extends WorkspaceModelModificationEvent {
    constructor() {
        super({ type: "MoveItemUpShortcutEvent" });
    }

    process() {
        const model = WorkspaceModelManager.getWorkspaceModel();

        if (model) {
            return model.moveFocusedItemUp().match({
                ok: (m) => {
                    this.model = m;
                    return Result.Ok<WorkspaceChangeEvent>(this);
                },
                error: (e) => Result.Err<WorkspaceChangeEvent>(e),
            });
        } else {
            return Result.Err<WorkspaceChangeEvent>(
                "No active workspace model",
            );
        }
    }
}

class MoveItemDownShortcutEvent extends WorkspaceModelModificationEvent {
    constructor() {
        super({ type: "MoveItemDownShortcutEvent" });
    }

    process() {
        const model = WorkspaceModelManager.getWorkspaceModel();

        if (model) {
            return model.moveFocusedItemDown().match({
                ok: (m) => {
                    this.model = m;
                    return Result.Ok<WorkspaceChangeEvent>(this);
                },
                error: (e) => Result.Err<WorkspaceChangeEvent>(e),
            });
        } else {
            return Result.Err<WorkspaceChangeEvent>(
                "No active workspace model",
            );
        }
    }
}

class MoveItemLeftShortcutEvent extends WorkspaceModelModificationEvent {
    constructor() {
        super({ type: "MoveItemLeftShortcutEvent" });
    }

    process() {
        const model = WorkspaceModelManager.getWorkspaceModel();

        if (model) {
            return model.moveFocusedItemLeft().match({
                ok: (m) => {
                    this.model = m;
                    return Result.Ok<WorkspaceChangeEvent>(this);
                },
                error: (e) => Result.Err<WorkspaceChangeEvent>(e),
            });
        } else {
            return Result.Err<WorkspaceChangeEvent>(
                "No active workspace model",
            );
        }
    }
}

class MoveItemRightShortcutEvent extends WorkspaceModelModificationEvent {
    constructor() {
        super({ type: "MoveItemRightShortcutEvent" });
    }

    process() {
        const model = WorkspaceModelManager.getWorkspaceModel();

        if (model) {
            return model.moveFocusedItemRight().match({
                ok: (m) => {
                    this.model = m;
                    return Result.Ok<WorkspaceChangeEvent>(this);
                },
                error: (e) => Result.Err<WorkspaceChangeEvent>(e),
            });
        } else {
            return Result.Err<WorkspaceChangeEvent>(
                "No active workspace model",
            );
        }
    }
}

export { type WorkspaceChangeEvent, EventGenerator, EventProcessor };
