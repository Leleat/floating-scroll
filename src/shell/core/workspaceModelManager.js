import { Meta } from "../dependencies.js";

import { WorkspaceModel } from "./workspaceModel.js";

/**
 * @typedef {object} WorkspaceModelManager
 * @property {function(): void} destroy
 * @property {import("./workspaceModel.js").WorkspaceModel} getActiveWorkspaceModel
 * @property {function(import("./workspaceModel.js").WorkspaceModel): void} setActiveWorkspaceModel
 * @property {function(): Meta.Window[]} getWindows
 */

/** @type {WorkspaceModelManager} */
let SINGLETON = null;

function enable() {
    SINGLETON = new WorkspaceModelManager();
}

function disable() {
    SINGLETON.destroy();
    SINGLETON = null;
}

class WorkspaceModelManager {
    /** @type {import("./workspaceModel.js").WorkspaceModel} */
    #model = new WorkspaceModel({
        workspaceModelManager: this,
        workArea: global.workspace_manager // TODO update on change
            .get_active_workspace()
            .get_work_area_for_monitor(0),
    });

    destroy() {
        this.#model.destroy();
        this.#model = null;
    }

    /**
     * @returns {Meta.Window[]}
     */
    getWindows() {
        return global.display.get_tab_list(
            Meta.TabList.NORMAL_ALL,
            global.workspace_manager.get_active_workspace(),
        );
    }

    /**
     * @returns {import("./workspaceModel.js").WorkspaceModel}
     */
    getActiveWorkspaceModel() {
        return this.#model;
    }

    /**
     * @param {import("./workspaceModel.js").WorkspaceModel} model
     */
    setActiveWorkspaceModel(model) {
        this.#model = model;
    }
}

export { disable, enable, SINGLETON as WorkspaceModelManager };
