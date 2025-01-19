import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
    js.configs.recommended,
    eslintConfigPrettier,
    {
        languageOptions: {
            globals: {
                ARGV: "readonly",
                console: "readonly",
                Debugger: "readonly",
                GIRepositoryGType: "readonly",
                globalThis: "readonly",
                global: "readonly",
                imports: "readonly",
                Intl: "readonly",
                log: "readonly",
                logError: "readonly",
                print: "readonly",
                printerr: "readonly",
                process: "readonly",
                window: "readonly",
                TextEncoder: "readonly",
                TextDecoder: "readonly",
            },
        },
        rules: {
            curly: ["error", "all"],
        },
    },
];
