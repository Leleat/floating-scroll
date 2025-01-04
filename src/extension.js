import { Extension } from "./shell/dependencies.js";

import {
    disable as disableInjections,
    enable as enableInjections,
} from "./shell/utils/injections.js";

export default class FloatingScroll extends Extension {
    enable() {
        // singletons
        enableInjections();
    }

    disable() {
        // singletons
        disableInjections();
    }
}
