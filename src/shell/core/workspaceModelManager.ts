import { Meta } from "../dependencies.js";

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
    private model = new WorkspaceModel({
        workspaceModelManager: this,
        workArea: global.workspace_manager // TODO update on change
            .get_active_workspace()
            .get_work_area_for_monitor(0),
    });

    destroy() {
        this.model.destroy();
        this.model = null!;
    }

    getWindows() {
        return global.display.get_tab_list(
            Meta.TabList.NORMAL_ALL,
            global.workspace_manager.get_active_workspace(),
        );
    }

    getActiveWorkspaceModel() {
        return this.model;
    }

    setActiveWorkspaceModel(model: WorkspaceModel) {
        this.model = model;
    }
}

export { disable, enable, SINGLETON as WorkspaceModelManager };
