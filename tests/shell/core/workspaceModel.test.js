import { describe, expect, it, vi } from "vitest";

import { WorkspaceModel } from "../../../src/shell/core/workspaceModel.js";

vi.mock("../../../src/shell/utils/debug.js", () => {
    return { Debug: { assert: () => {} } };
});

vi.mock("../../../src/shell/utils/settings.js", () => {
    return {
        Settings: {
            getWindowOpeningPosition: () => 0,
            getFocusBehaviorMainAxis: () => 0,
            getFocusBehaviorCrossAxis: () => 0,
        },
    };
});

function createMockWindow(id) {
    return {
        id,
        focus: vi.fn(),
        get_frame_rect() {
            return {
                x: 0,
                y: 0,
                width: 100,
                height: 100,
            };
        },
    };
}

function createMockWindows() {
    return [
        createMockWindow(0),
        createMockWindow(1),
        createMockWindow(2),
        createMockWindow(3),
        createMockWindow(4),
        createMockWindow(5),
    ];
}

/**
 * @returns {WorkspaceModel}
 */
function createBaseModel(windows) {
    return new WorkspaceModel({
        focusedColumn: 1,
        workArea: {
            x: 0,
            y: 0,
            width: 1000,
            height: 1000,
        },
        columns: [
            {
                // Column 0
                focusedItem: 1,
                items: [
                    {
                        value: windows[0],
                        rect: { x: 350, y: 350, width: 100, height: 100 },
                    },
                    {
                        value: windows[1],
                        rect: { x: 400, y: 450, width: 50, height: 100 },
                    },
                ],
            },
            {
                // Column 1 (Focused)
                focusedItem: 0,
                items: [
                    {
                        value: windows[2],
                        rect: { x: 450, y: 450, width: 100, height: 100 },
                    },
                ],
            },
            {
                // Column 2
                focusedItem: 0,
                items: [
                    {
                        value: windows[3],
                        rect: { x: 550, y: 475, width: 50, height: 50 },
                    },
                    {
                        value: windows[4],
                        rect: { x: 550, y: 525, width: 100, height: 100 },
                    },
                ],
            },
            {
                // Column 3
                focusedItem: 0,
                items: [
                    {
                        value: windows[5],
                        rect: { x: 650, y: 450, width: 100, height: 100 },
                    },
                ],
            },
        ],
    });
}

describe("Workspace Model", () => {
    it("getGrid should return the item grid in global coordinates", () => {
        const windows = createMockWindows();
        const model = createBaseModel(windows);
        const grid = model.getGrid();

        expect(grid.items).toStrictEqual([
            [
                // Column 0
                {
                    rect: {
                        x: 350,
                        y: 350,
                        width: 100,
                        height: 100,
                    },
                    value: windows[0],
                },
                {
                    rect: {
                        x: 400,
                        y: 450,
                        width: 50,
                        height: 100,
                    },
                    value: windows[1],
                },
            ],
            [
                // Column 1 (Focused)
                {
                    rect: { x: 450, y: 450, width: 100, height: 100 },
                    value: windows[2],
                },
            ],
            [
                // Column 2
                {
                    rect: {
                        x: 550,
                        y: 475,
                        width: 50,
                        height: 50,
                    },
                    value: windows[3],
                },
                {
                    rect: {
                        x: 550,
                        y: 525,
                        width: 100,
                        height: 100,
                    },
                    value: windows[4],
                },
            ],
            [
                // Column 3
                {
                    rect: {
                        x: 650,
                        y: 450,
                        width: 100,
                        height: 100,
                    },
                    value: windows[5],
                },
            ],
        ]);
    });
});
