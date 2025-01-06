import { Extension } from "./shell/dependencies.js";

import {
    disable as disableInjections,
    enable as enableInjections,
} from "./shell/utils/injections.js";
import {
    disable as disableSettings,
    enable as enableSettings,
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
        // singletons
        enableTimeouts();
        enableSettings();
        enableShortcuts();
        enableInjections();
    }

    disable() {
        // singletons
        disableInjections();
        disableShortcuts();
        disableSettings();
        disableTimeouts();
    }
}
