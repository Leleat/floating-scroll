// TODO TypeScript wizard needed here...
/* eslint-disable @typescript-eslint/no-explicit-any */

import { InjectionManager } from "../dependencies.js";

let SINGLETON: Injections = null!;

function enable() {
    SINGLETON = new Injections();
}

function disable() {
    SINGLETON.destroy();
    SINGLETON = null!;
}

class Injections {
    private injectionManager = new InjectionManager();
    private injectedProperties: Map<{ [key: string]: any }, string[]> =
        new Map();

    destroy() {
        this.injectionManager.clear();

        this.injectedProperties.forEach((injectedProps, target) => {
            injectedProps.forEach((prop: string) => {
                // accessor props
                delete target[prop];
                // data props
                delete target[`__injected_map_${prop}`];
            });
        });
        this.injectedProperties.clear();
    }

    /**
     * Injects new accessor property into a prototype
     *
     * @param prototype -
     * @param prop -
     * @param descriptor -
     */
    addAccessorProperty(
        prototype: { [key: string]: any },
        prop: string,
        descriptor: object,
    ) {
        if (prototype[prop] !== undefined) {
            throw new Error(
                `Overwriting existing property (${prop}) not supported....`,
            );
        }

        Object.defineProperty(prototype, prop, {
            ...descriptor,
            configurable: true,
        });

        const propNames = this.injectedProperties.get(prototype);

        if (propNames) {
            propNames.push(prop);
        } else {
            this.injectedProperties.set(prototype, [prop]);
        }
    }

    /**
     * Injects 'data properties' into objects. Behind the scenes this actually
     * attaches a WeakMap to the prototype with 'object instances' serving as
     * keys. The values of the Map are the 'instance properties'. By attaching
     * everything to the prototype, the removal of the custom properties is
     * relativly easy. We just need to track the prototype rather than finding
     * or tracking all object instances.
     */
    addDataProperty(prototype: { [key: string]: any }, prop: string) {
        if (prototype[prop] !== undefined) {
            throw new Error(
                `Overwriting existing property (${prop}) not supported....`,
            );
        }

        if (!prototype[`__injected_map_${prop}`]) {
            prototype[`__injected_map_${prop}`] = new WeakMap();
        }

        Object.defineProperty(prototype, prop, {
            get() {
                return this[`__injected_map_${prop}`].get(this);
            },
            set(value) {
                this[`__injected_map_${prop}`].set(this, value);
            },
            configurable: true,
        });

        const propNames = this.injectedProperties.get(prototype);

        if (propNames) {
            propNames.push(prop);
        } else {
            this.injectedProperties.set(prototype, [prop]);
        }
    }

    /**
     * Modifies, replaces or injects a method into a (prototype) object
     *
     * @param prototype - the object (or prototype) that is modified
     * @param methodName - the name of the overwritten method
     * @param createOverrideFunc - function to call
     *      to create the override. The parameter will be the original function,
     *      if it exists. It returns the new function be used for `methodName`.
     */
    overrideMethod(
        prototype: { [key: string]: any },
        methodName: string,
        createOverrideFunc: (
            original: (...args: any[]) => any,
        ) => (...args: any[]) => any,
    ) {
        this.injectionManager.overrideMethod(
            prototype,
            methodName,
            createOverrideFunc,
        );
    }

    /**
     * Deletes a custom property injected with this singleton
     */
    deleteProperty(prototype: { [key: string]: any }, propName: string) {
        const propNames = this.injectedProperties.get(prototype);

        if (!propNames || !propNames.includes(propName)) {
            return;
        }

        if (propNames.length === 1) {
            this.injectedProperties.delete(prototype);
        } else {
            this.injectedProperties.set(
                prototype,
                propNames.filter((p) => p !== propName),
            );
        }

        // accessor prop
        delete prototype[propName];
        // data prop
        delete prototype[`__injected_map_${propName}`];
    }

    /**
     * Restores the original method
     */
    restoreMethod(prototype: { [key: string]: any }, methodName: string) {
        this.injectionManager.restoreMethod(prototype, methodName);
    }
}

export { disable, enable, SINGLETON as Injections };
