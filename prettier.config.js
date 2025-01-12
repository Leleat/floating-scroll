/** @type {import("prettier").Config} */
export default {
    tabWidth: 4,
    experimentalTernaries: true,
    overrides: [
        {
            files: ["*.json", "*.yml", "*.yaml"],
            options: {
                tabWidth: 2,
            },
        },
    ],
};
