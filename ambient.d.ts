import "@girs/gjs";
import "@girs/gjs/dom";
import "@girs/gnome-shell/ambient";
import "@girs/gnome-shell/extensions/global";

/************************
 * Module augmentations *
 ************************/

declare module "./src/shell/dependencies.js" {
    namespace Clutter {
        interface Actor {
            ease: (props: object) => void;
            set: (params: { [prop: string]: unknown }) => void;
        }
    }

    namespace GObject {
        interface Object {
            connectObject: (...args: unknown[]) => void;
            disconnectObject: (object: object) => void;
        }
    }

    namespace Meta {
        interface Window {
            isTrackedByFloatingScroll: boolean;
        }
    }
}
