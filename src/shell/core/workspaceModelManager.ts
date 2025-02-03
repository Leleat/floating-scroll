import { Meta } from "../dependencies.js";
import { Debug, decorateFnWithLog } from "../utils/debug.js";

import { WorkspaceModel } from "./workspaceModel.js";

let SINGLETON: WorkspaceModelManager = null!;

function enable() {
    SINGLETON = new WorkspaceModelManager();
}

function disable() {
    SINGLETON.destroy();
    SINGLETON = null!;
}

class WorkspaceModelManager {
    private model?: WorkspaceModel;

    @decorateFnWithLog("log", "WorkspaceModelManager")
    destroy() {
        this.model?.destroy();
        this.model = undefined;
    }

    @decorateFnWithLog("log", "WorkspaceModelManager")
    getWindows() {
        return global.display.get_tab_list(
            Meta.TabList.NORMAL_ALL,
            global.workspace_manager.get_active_workspace(),
        );
    }

    @decorateFnWithLog("log", "WorkspaceModelManager")
    createWorkspaceModel(initialWindow: Meta.Window): WorkspaceModel {
        Debug.assert(this.model === undefined, "A model already exists.");

        return WorkspaceModel.build({ initialWindow });
    }

    @decorateFnWithLog("log", "WorkspaceModelManager")
    removeWorkspaceModel(model: WorkspaceModel) {
        Debug.assert(this.model === model, "Trying to remove the wrong model");

        this.model = undefined;
    }

    @decorateFnWithLog("log", "WorkspaceModelManager")
    getWorkspaceModel() {
        return this.model;
    }

    @decorateFnWithLog("log", "WorkspaceModelManager")
    setWorkspaceModel(model: WorkspaceModel) {
        Debug.assert(this.model !== model, "Model is already set.");

        this.model = model;
        this.model?.connect("destroy", () => (this.model = undefined));
    }
}

export { disable, enable, SINGLETON as WorkspaceModelManager };
