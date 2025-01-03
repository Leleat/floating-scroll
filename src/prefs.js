import { Adw, ExtensionPreferences } from "./prefs/dependencies.js";

export default class Prefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.add(new Adw.PreferencesPage());
    }
}
