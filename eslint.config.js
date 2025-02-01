// @ts-check

import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.es2021,
                ARGV: "readonly",
                console: "readonly",
                Debugger: "readonly",
                GIRepositoryGType: "readonly",
                global: "readonly",
                globalThis: "readonly",
                imports: "readonly",
                Intl: "readonly",
                log: "readonly",
                logError: "readonly",
                print: "readonly",
                printerr: "readonly",
                process: "readonly",
                TextDecoder: "readonly",
                TextEncoder: "readonly",
                window: "readonly",
            },
        },
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
);
