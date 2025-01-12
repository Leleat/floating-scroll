import { Adw, Gdk, GObject, Gtk } from "./dependencies.js";

import {
    disableMultiStageShortcutActivators,
    updateMultiStageShortcutActivators,
} from "../shared.js";
import {
    clutterToGdkMask,
    formatShortcut,
    gdkToClutterMask,
    getSettings,
    isValidShortcut,
} from "./utils.js";

const NO_ACCEL_TEXT = "Shortcut disabled";

export class FsShortcutEditor extends Adw.Window {
    static {
        GObject.registerClass(
            {
                GTypeName: "FsShortcutEditor",
                InternalChildren: [
                    "apply-button",
                    "preview-new-shortcut-label",
                ],
                Template: "resource:///ui/components/fsShortcutEditor.ui",
            },
            this,
        );
    }

    /** @type {string} */
    _currShortcutKey;
    /** @type {string[]} */
    _prevActivators;
    /** @type {string} */
    _currPrimaryActivator = "";
    /** @type {string[]} */
    _currSecondaryActivators = [];

    /**
     * @param {object} param
     * @param {string} param.shortcutName
     * @param {string} param.shortcutKey
     * @param {object} param.params
     */
    constructor({ shortcutName, shortcutKey, ...params }) {
        super({
            title: shortcutName,
            ...params,
        });

        const settings = getSettings();

        this._currShortcutKey = shortcutKey;
        this._prevActivators = settings.get_strv(shortcutKey);

        const [primaryActivator, ...secondaryActivators] = this._prevActivators;

        this._setPreviewLabel({
            primaryActivator,
            secondaryActivators: secondaryActivators.map((s) => {
                const [keyval, mask] = s.split("+").map(Number);

                return { keyval, mask: clutterToGdkMask(mask) };
            }),
        });

        this.connect("map", () =>
            disableMultiStageShortcutActivators(settings),
        );
        this.connect("unmap", () =>
            updateMultiStageShortcutActivators(settings),
        );
    }

    on_apply_button_clicked() {
        const settings = getSettings();

        settings.set_strv(
            this._currShortcutKey,
            this._currPrimaryActivator ?
                [
                    this._currPrimaryActivator,
                    ...this._currSecondaryActivators.map(
                        (s) => `${s.keyval}+${gdkToClutterMask(s.mask)}`,
                    ),
                ]
            :   [],
        );

        this.close();
    }

    /**
     * @param {Gtk.EventController} eventController
     * @param {number} keyval
     * @param {number} keycode
     * @param {Gdk.ModifierType} state
     *
     * @returns {Gdk.EVENT_STOP}
     */
    on_event_controller_key_pressed(_, keyval, keycode, state) {
        const mask =
            state &
            Gtk.accelerator_get_default_mod_mask() &
            ~Gdk.ModifierType.LOCK_MASK;

        if (mask === 0) {
            switch (keyval) {
                case Gdk.KEY_Escape:
                    this.close();

                    return Gdk.EVENT_STOP;
                case Gdk.KEY_BackSpace:
                    this._apply_button.set_sensitive(true);
                    this._updateShortcuts({
                        primaryActivator: "",
                        secondaryActivators: [],
                    });

                    return Gdk.EVENT_STOP;
                case Gdk.KEY_KP_Enter:
                case Gdk.KEY_Return:
                case Gdk.KEY_space:
                    this.on_apply_button_clicked();

                    return Gdk.EVENT_STOP;
            }
        }

        if (this._currPrimaryActivator) {
            if (!Gtk.accelerator_valid(keyval, mask)) {
                return Gdk.EVENT_STOP;
            }

            this._apply_button.set_sensitive(true);

            this._updateShortcuts({
                primaryActivator: this._currPrimaryActivator,
                secondaryActivators: this._currSecondaryActivators.concat({
                    keyval,
                    mask,
                }),
            });
        } else {
            if (!isValidShortcut({ keycode, keyval, mask })) {
                return Gdk.EVENT_STOP;
            }

            this._apply_button.set_sensitive(true);

            this._updateShortcuts({
                primaryActivator: Gtk.accelerator_name_with_keycode(
                    null,
                    keyval,
                    keycode,
                    mask,
                ),
                secondaryActivators: [],
            });
        }

        return Gdk.EVENT_STOP;
    }

    _setPreviewLabel({ primaryActivator, secondaryActivators }) {
        if (primaryActivator) {
            const secondaryActivatorLabels = secondaryActivators.map((c) =>
                Gtk.accelerator_get_label(c.keyval, c.mask),
            );
            const separator = secondaryActivatorLabels.length ? "        " : "";
            const shortcutLabel = `${formatShortcut(
                primaryActivator,
            )}${separator}${secondaryActivatorLabels.join(separator)}`;

            this._preview_new_shortcut_label.set_tooltip_text(shortcutLabel);
            this._preview_new_shortcut_label.set_label(
                `<b>${shortcutLabel}</b>`,
            );
        } else {
            this._preview_new_shortcut_label.set_tooltip_text(NO_ACCEL_TEXT);
            this._preview_new_shortcut_label.set_label(
                `<i>${NO_ACCEL_TEXT}</i>`,
            );
        }
    }

    /**
     * @param {object} param
     * @param {string} param.primaryActivator
     * @param {string[]} param.secondaryActivators
     */
    _updateShortcuts({ primaryActivator, secondaryActivators }) {
        this._setPreviewLabel({ primaryActivator, secondaryActivators });

        this._currPrimaryActivator = primaryActivator;
        this._currSecondaryActivators = secondaryActivators;
    }
}
