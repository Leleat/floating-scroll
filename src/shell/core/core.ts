import {
    disable as disableWorkspaceModelManager,
    enable as enableWorkspaceModelManager,
} from "./workspaceModelManager.js";
import {
    disable as disableWorkspaceView,
    enable as enableWorkspaceView,
} from "./workspaceView.js";

function enable() {
    enableWorkspaceModelManager();
    enableWorkspaceView();
}

function disable() {
    disableWorkspaceView();
    disableWorkspaceModelManager();
}

export { disable, enable };
