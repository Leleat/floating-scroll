import { GLib } from "../dependencies.js";
import { Debug } from "../utils/debug.js";

import { Timeouts } from "../utils/timeouts.js";
import { type Event, EventGenerator, EventProcessor } from "./eventSystem.js";
import { WorkspaceModel } from "./workspaceModel.js";
import { WorkspaceModelManager } from "./workspaceModelManager.js";

let SINGLETON: WorkspaceView = null!;

function enable() {
    SINGLETON = new WorkspaceView();
}

function disable() {
    SINGLETON.destroy();
    SINGLETON = null!;
}

class WorkspaceView {
    private eventGenerator = new EventGenerator();
    private eventProcessor = new EventProcessor();

    constructor() {
        this.eventGenerator.sub(this, (e) => this.onEvent(e));
    }

    destroy() {
        this.eventGenerator.destroy();
        this.eventGenerator = null!;

        this.eventProcessor.destroy();
        this.eventProcessor = null!;
    }

    private onEvent(event: Event) {
        this.eventProcessor
            .processEvent(event)
            .inspect((model) => {
                WorkspaceModelManager.setActiveWorkspaceModel(model);

                this.update(model);
            })
            .inspectErr((e) => {
                Debug.log(e);
            });
    }

    private update(model: WorkspaceModel) {
        // TODO Just quick hack to not redo the updates for all events since
        // TODO many "focus-change" events are sent, for instance, when opening
        // TODO a window
        Timeouts.add({
            name: "workspaceViewUpdate",
            interval: 20,
            fn: () => {
                const grid = model.getGrid();

                grid.items.forEach((col) => {
                    col.forEach((item) => item.sync());
                });

                return GLib.SOURCE_REMOVE;
            },
        });
    }
}

export { disable, enable, SINGLETON as WorkspaceView };
