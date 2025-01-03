import '@girs/gjs';
import '@girs/gjs/dom';
import '@girs/gnome-shell/ambient';
import '@girs/gnome-shell/extensions/global';

/***********************
 * Module Augmentation *
 ***********************/

declare module '@girs/gobject-2.0' {
    namespace GObject {
        interface Object {
            connectObject: (...args: unknown[]) => void;
            disconnectObject: (object: object) => void;
        }
    }
}
