import { GLib } from "../dependencies.js";

let SINGLETON: Timeouts = null!;

function enable() {
    SINGLETON = new Timeouts();
}

function disable() {
    SINGLETON.destroy();
    SINGLETON = null!;
}

/**
 * A convenience class to add timeouts that automatically removes the running
 * timeouts when the extensions is disabled. Otherwise each object or class
 * that uses a timeout needs to track their timeouts and remove them on disable
 * via `destroy`.
 */
class Timeouts {
    private sourceIdAndNames: Map<number, string> = new Map();

    destroy() {
        this.sourceIdAndNames.forEach((_, id) => GLib.Source.remove(id));
        this.sourceIdAndNames.clear();
    }

    /**
     * @param param
     * @param param.interval - the time between calls of `fn` in ms
     * @param param.fn - the function to call after `interval`
     * @param param.name - the `name` to give a timeout. A `name` can
     *      only be associated with 1 timeout. The previous timeout associated
     *      with `name` will be stopped.
     * @param param.priority - the GLib priority. The default is
     *      `GLib.PRIORITY_DEFAULT`
     *
     * @returns the id of the event source
     */
    add({
        interval,
        fn,
        priority = GLib.PRIORITY_DEFAULT,
        name = "",
    }: {
        interval: number;
        fn: () => boolean;
        name?: string;
        priority?: number;
    }): number {
        if (name) {
            for (const [id, _name] of this.sourceIdAndNames.entries()) {
                if (name === _name) {
                    this.remove(id);
                    break;
                }
            }
        }

        let sourceID = 0;
        const selfRemovingFn = () => {
            const returnVal = fn();

            if (returnVal === GLib.SOURCE_REMOVE) {
                this.sourceIdAndNames.delete(sourceID);
            }

            return returnVal;
        };

        sourceID = GLib.timeout_add(priority, interval, selfRemovingFn);

        this.sourceIdAndNames.set(sourceID, name);

        return sourceID;
    }

    remove(id: number) {
        if (!this.sourceIdAndNames.has(id)) {
            return;
        }

        this.sourceIdAndNames.delete(id);
        GLib.Source.remove(id);
    }
}

export { disable, enable, SINGLETON as Timeouts };
