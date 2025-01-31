/** The amount of multi-stage shortcut activators defined in the schema */
export const MULTI_STAGE_SHORTCUT_ACTIVATOR_COUNT = 30;

/**
 * @param {Gio.Settings} settings
 */
export function disableMultiStageShortcutActivators(settings) {
    for (let i = 0; i < MULTI_STAGE_SHORTCUT_ACTIVATOR_COUNT; i++) {
        settings.set_strv(`multi-stage-shortcut-activator-${i}`, []);
    }
}

/**
 * @param {Gio.Settings} settings
 */
export function updateMultiStageShortcutActivators(settings) {
    disableMultiStageShortcutActivators(settings);

    const savedMultiStageActivators = [];
    const keys = [];

    keys.forEach((key) => {
        const activators = settings.get_strv(key);
        const isMultiStageShortcut = activators.length > 1;

        if (!isMultiStageShortcut) {
            return;
        }

        const [primaryActivator] = activators;

        if (savedMultiStageActivators.includes(primaryActivator)) {
            return;
        }

        for (let i = 0; i < MULTI_STAGE_SHORTCUT_ACTIVATOR_COUNT; i++) {
            const multiStageActivators = settings.get_strv(
                `multi-stage-shortcut-activator-${i}`,
            );

            if (multiStageActivators.length === 0) {
                savedMultiStageActivators.push(primaryActivator);
                settings.set_strv(`multi-stage-shortcut-activator-${i}`, [
                    primaryActivator,
                ]);

                return;
            }
        }

        // TODO make this more user-friendly and turn this error into a notification
        throw new Error(
            "No more multi-stage shortcut activators available. Please report this issue on GitHub.",
        );
    });
}
