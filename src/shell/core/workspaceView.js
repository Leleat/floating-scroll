import { GLib } from "../dependencies.js";

import { Timeouts } from "../utils/timeouts.js";
import { EventGenerator, EventProcessor } from "./eventSystem.js";
import { WorkspaceModelManager } from "./workspaceModelManager.js";

/** @type {WorkspaceView} */
let SINGLETON = null;

function enable() {
    SINGLETON = new WorkspaceView();
}

function disable() {
    SINGLETON.destroy();
    SINGLETON = null;
}

class WorkspaceView {
    /** @type {EventGenerator} */
    #eventGenerator = new EventGenerator();

    /** @type {EventProcessor} */
    #eventProcessor = new EventProcessor();

    constructor() {
        this.#eventGenerator.sub(this, (e) => this.#onEvent(e));
    }

    destroy() {
        this.#eventGenerator.destroy();
        this.#eventGenerator = null;

        this.#eventProcessor.destroy();
        this.#eventProcessor = null;
    }

    /**
     * @param {Event} event
     */
    #onEvent(event) {
        const result = this.#eventProcessor.processEvent(event);

        if (result.ok) {
            WorkspaceModelManager.setActiveWorkspaceModel(result.model);

            this.#update(result.model);
        }
    }

    /**
     * @param {import("./workspaceModel.js").WorkspaceModel} model
     */
    #update(model) {
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
