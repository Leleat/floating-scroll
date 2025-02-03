import { Extension } from "./shell/dependencies.js";

import {
    disable as disableCoreModules,
    enable as enableCoreModules,
} from "./shell/core/core.js";
import {
    disable as disableOverrides,
    enable as enableOverrides,
} from "./shell/overrides.js";
import {
    disable as disableDebugModule,
    enable as enableDebugModule,
} from "./shell/utils/debug.js";
import {
    disable as disableInjections,
    enable as enableInjections,
} from "./shell/utils/injections.js";
import {
    disable as disableSettings,
    enable as enableSettings,
    Settings,
} from "./shell/utils/settings.js";
import {
    disable as disableShortcuts,
    enable as enableShortcuts,
} from "./shell/utils/shortcuts.js";
import {
    disable as disableTimeouts,
    enable as enableTimeouts,
} from "./shell/utils/timeouts.js";

export default class FloatingScroll extends Extension {
    enable() {
        enableTimeouts();
        enableSettings();
        enableShortcuts();
        enableInjections();
        enableDebugModule(Settings, "[floating-scroll]");
        enableOverrides();
        enableCoreModules();
    }

    disable() {
        disableCoreModules();
        disableOverrides();
        disableDebugModule();
        disableInjections();
        disableShortcuts();
        disableSettings();
        disableTimeouts();
    }
}
