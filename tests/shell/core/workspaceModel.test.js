import { describe, expect, it, vi } from "vitest";

import {
    TestEnv,
    WorkspaceModel,
} from "../../../src/shell/core/workspaceModel.js";

describe("Workspace Model", () => {
    it("getGrid should return the item grid in global coordinates", () => {
        const windows = createMockWindows();
        const model = createBaseModel(windows);
        const grid = model.getGrid();

        testGridItems(grid.items, [
            [
                // Column 0
                new TestEnv.Item({
                    value: windows[0],
                    rect: {
                        x: 350,
                        y: 350,
                        width: 100,
                        height: 100,
                    },
                }),
                new TestEnv.Item({
                    value: windows[1],
                    rect: {
                        x: 400,
                        y: 450,
                        width: 50,
                        height: 100,
                    },
                }),
            ],
            [
                // Column 1 (Focused)
                new TestEnv.Item({
                    value: windows[2],
                    rect: {
                        x: 450,
                        y: 450,
                        width: 100,
                        height: 100,
                    },
                }),
            ],
            [
                // Column 2
                new TestEnv.Item({
                    value: windows[3],
                    rect: {
                        x: 550,
                        y: 475,
                        width: 50,
                        height: 50,
                    },
                }),
                new TestEnv.Item({
                    value: windows[4],
                    rect: {
                        x: 550,
                        y: 525,
                        width: 100,
                        height: 100,
                    },
                }),
            ],
            [
                // Column 3
                new TestEnv.Item({
                    value: windows[5],
                    rect: {
                        x: 650,
                        y: 450,
                        width: 100,
                        height: 100,
                    },
                }),
            ],
        ]);
    });

    it("relayout should reflow the layout around the (focused) input window", () => {
        const windows = createMockWindows();
        const model = createBaseModel(windows);
        const { model: newModel } = model.relayout(windows[0]);

        testGridItems(newModel.getGrid().items, [
            [
                // Column 0 (Focused)
                new TestEnv.Item({
                    value: windows[0],
                    rect: {
                        x: 450,
                        y: 450,
                        width: 100,
                        height: 100,
                    },
                }),
                new TestEnv.Item({
                    value: windows[1],
                    rect: {
                        x: 475,
                        y: 550,
                        width: 50,
                        height: 100,
                    },
                }),
            ],
            [
                // Column 1
                new TestEnv.Item({
                    value: windows[2],
                    rect: {
                        x: 550,
                        y: 450,
                        width: 100,
                        height: 100,
                    },
                }),
            ],
            [
                // Column 2
                new TestEnv.Item({
                    value: windows[3],
                    rect: {
                        x: 650,
                        y: 475,
                        width: 50,
                        height: 50,
                    },
                }),
                new TestEnv.Item({
                    value: windows[4],
                    rect: {
                        x: 650,
                        y: 525,
                        width: 100,
                        height: 100,
                    },
                }),
            ],
            [
                // Column 3
                new TestEnv.Item({
                    value: windows[5],
                    rect: {
                        x: 750,
                        y: 450,
                        width: 100,
                        height: 100,
                    },
                }),
            ],
        ]);
    });

    describe("getItemOnLeftOfFocus should get the window on the left of the current focus if there is one", () => {
        const windows = createMockWindows();
        const model = createBaseModel(windows);

        it("should return the window on the left of the current focus window", () => {
            const win = model.getItemOnLeftOfFocus();

            expect(win).toBe(windows[1]);
        });

        it("should return undefined if there is no window on the left", () => {
            const { model: newModel } = model.relayout(windows[0]);

            expect(newModel.getItemOnLeftOfFocus()).toBeUndefined();
        });
    });

    describe("getItemOnRightOfFocus should get the window on the right of the current focus if there is one", () => {
        const windows = createMockWindows();
        const model = createBaseModel(windows);

        it("should return the window on the right of the current focus window", () => {
            const win = model.getItemOnRightOfFocus();

            expect(win).toBe(windows[3]);
        });

        it("should return undefined if there is no window on the right", () => {
            const { model: newModel } = model.relayout(windows[5]);

            expect(newModel.getItemOnRightOfFocus()).toBeUndefined();
        });
    });

    describe("getItemAboveFocus should get the window above the current focus if there is one", () => {
        const windows = createMockWindows();
        const model = createBaseModel(windows);

        it("should return undefined if there is no window above", () => {
            const win = model.getItemAboveFocus();

            expect(win).toBeUndefined();
        });

        it("should return the window above the current focus window", () => {
            const { model: newModel } = model.relayout(windows[1]);
            const win = newModel.getItemAboveFocus();

            expect(win).toBe(windows[0]);
        });
    });

    describe("getItemBelowFocus should get the window below the current focus if there is one", () => {
        const windows = createMockWindows();
        const model = createBaseModel(windows);

        it("should return undefined if there is no window below", () => {
            const win = model.getItemBelowFocus();

            expect(win).toBeUndefined();
        });

        it("should return the window below the current focus window", () => {
            const { model: newModel } = model.relayout(windows[0]);
            const win = newModel.getItemBelowFocus();

            expect(win).toBe(windows[1]);
        });
    });

    describe("moveFocusedColumnLeft should move the focused column to the left if possible", () => {
        const windows = createMockWindows();
        const model = createBaseModel(windows);
        const { model: newModel } = model.moveFocusedColumnLeft();

        it("should move the focused column to the left if possible", () => {
            testGridItems(newModel.getGrid().items, [
                [
                    // Column 0 (Focused)
                    new TestEnv.Item({
                        value: windows[2],
                        rect: {
                            x: 450,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 1
                    new TestEnv.Item({
                        value: windows[0],
                        rect: {
                            x: 550,
                            y: 350,
                            width: 100,
                            height: 100,
                        },
                    }),
                    new TestEnv.Item({
                        value: windows[1],
                        rect: {
                            x: 550,
                            y: 450,
                            width: 50,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 2
                    new TestEnv.Item({
                        value: windows[3],
                        rect: {
                            x: 650,
                            y: 475,
                            width: 50,
                            height: 50,
                        },
                    }),
                    new TestEnv.Item({
                        value: windows[4],
                        rect: {
                            x: 650,
                            y: 525,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 3
                    new TestEnv.Item({
                        value: windows[5],
                        rect: {
                            x: 750,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
            ]);
        });

        it("should do nothing if the focused column is already at the left", () => {
            const { ok } = newModel.moveFocusedColumnLeft();

            expect(ok).toBe(false);
        });
    });

    describe("moveFocusedColumnRight should move the focused column to the right if possible", () => {
        const windows = createMockWindows();
        const model = createBaseModel(windows);
        const { model: newModel } = model.moveFocusedColumnRight();

        it("should move the focused column to the right if possible", () => {
            testGridItems(newModel.getGrid().items, [
                [
                    // Column 0
                    new TestEnv.Item({
                        value: windows[0],
                        rect: {
                            x: 250,
                            y: 350,
                            width: 100,
                            height: 100,
                        },
                    }),
                    new TestEnv.Item({
                        value: windows[1],
                        rect: {
                            x: 300,
                            y: 450,
                            width: 50,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 1
                    new TestEnv.Item({
                        value: windows[3],
                        rect: {
                            x: 400,
                            y: 475,
                            width: 50,
                            height: 50,
                        },
                    }),
                    new TestEnv.Item({
                        value: windows[4],
                        rect: {
                            x: 350,
                            y: 525,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 2 (Focused)
                    new TestEnv.Item({
                        value: windows[2],
                        rect: {
                            x: 450,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 3
                    new TestEnv.Item({
                        value: windows[5],
                        rect: {
                            x: 550,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
            ]);
        });

        it("should do nothing if the focused column is already at the right", () => {
            const { model: newModel2 } = newModel.moveFocusedColumnRight();
            const { ok } = newModel2.moveFocusedColumnRight();

            expect(ok).toBe(false);
        });
    });

    describe("moveFocusedItemUp should move the focused item up if possible", () => {
        const windows = createMockWindows();
        const model = createBaseModel(windows);

        it("should do nothing if the focused item is already at the top", () => {
            const { ok } = model.moveFocusedItemUp();

            expect(ok).toBe(false);
        });

        it("should move the focused item above if possible", () => {
            const { model: newModel } = model.relayout(windows[1]);
            const { model: newModel2 } = newModel.moveFocusedItemUp();

            testGridItems(newModel2.getGrid().items, [
                [
                    // Column 0 (Focused)
                    new TestEnv.Item({
                        value: windows[1],
                        rect: {
                            x: 475,
                            y: 450,
                            width: 50,
                            height: 100,
                        },
                    }),
                    new TestEnv.Item({
                        value: windows[0],
                        rect: {
                            x: 450,
                            y: 550,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 1
                    new TestEnv.Item({
                        value: windows[2],
                        rect: {
                            x: 550,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 2
                    new TestEnv.Item({
                        value: windows[3],
                        rect: {
                            x: 650,
                            y: 475,
                            width: 50,
                            height: 50,
                        },
                    }),
                    new TestEnv.Item({
                        value: windows[4],
                        rect: {
                            x: 650,
                            y: 525,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 3
                    new TestEnv.Item({
                        value: windows[5],
                        rect: {
                            x: 750,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
            ]);
        });
    });

    describe("moveFocusedItemDown", () => {
        const windows = createMockWindows();
        const model = createBaseModel(windows);

        it("should do nothing if the focused item is already at the bottom", () => {
            const { ok } = model.moveFocusedItemDown();

            expect(ok).toBe(false);
        });

        it("should move the focused item down if possible", () => {
            const { model: newModel } = model.relayout(windows[3]);
            const { model: newModel2 } = newModel.moveFocusedItemDown();

            testGridItems(newModel2.getGrid().items, [
                [
                    // Column 0
                    new TestEnv.Item({
                        value: windows[0],
                        rect: {
                            x: 250,
                            y: 350,
                            width: 100,
                            height: 100,
                        },
                    }),
                    new TestEnv.Item({
                        value: windows[1],
                        rect: {
                            x: 300,
                            y: 450,
                            width: 50,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 1
                    new TestEnv.Item({
                        value: windows[2],
                        rect: {
                            x: 350,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 2 (Focused)
                    new TestEnv.Item({
                        value: windows[4],
                        rect: {
                            x: 450,
                            y: 375,
                            width: 100,
                            height: 100,
                        },
                    }),
                    new TestEnv.Item({
                        value: windows[3],
                        rect: {
                            x: 475,
                            y: 475,
                            width: 50,
                            height: 50,
                        },
                    }),
                ],
                [
                    // Column 3
                    new TestEnv.Item({
                        value: windows[5],
                        rect: {
                            x: 550,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
            ]);
        });
    });

    describe("insertWindow", () => {
        const windows = createMockWindows();
        const newWindow = createMockWindow(windows.length);

        const model = createBaseModel(windows);

        it("should insert a window into an empty model using different opening positions", () => {
            const freshModel = new WorkspaceModel({
                workspaceModelManager: createMockWorkspaceModelManager(windows),
                workArea: { x: 0, y: 0, width: 1000, height: 1000 },
            });
            const { model: superFreshModel } =
                freshModel.insertWindow(newWindow);

            testGridItems(superFreshModel.getGrid().items, [
                [
                    new TestEnv.Item({
                        value: newWindow,
                        rect: {
                            x: 450,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
            ]);

            const newWindow2 = createMockWindow("newWindow2");
            const { model: newModel2 } =
                superFreshModel.insertWindow(newWindow2);

            testGridItems(newModel2.getGrid().items, [
                [
                    new TestEnv.Item({
                        value: newWindow2,
                        rect: {
                            x: 450,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    new TestEnv.Item({
                        value: newWindow,
                        rect: {
                            x: 550,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
            ]);

            const newWindow3 = createMockWindow("newWindow3");
            const { model: newModel3 } = newModel2.insertWindow(newWindow3);

            testGridItems(newModel3.getGrid().items, [
                [
                    new TestEnv.Item({
                        value: newWindow2,
                        rect: {
                            x: 350,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    new TestEnv.Item({
                        value: newWindow3,
                        rect: {
                            x: 450,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    new TestEnv.Item({
                        value: newWindow,
                        rect: {
                            x: 550,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
            ]);

            const newWindow4 = createMockWindow("newWindow4");
            const { model: newModel4 } = newModel3
                .clone({
                    workspaceModelManager: createMockWorkspaceModelManager([
                        newWindow4,
                        newWindow3,
                        newWindow2,
                        newWindow,
                    ]),
                })
                .insertWindow(newWindow4);

            testGridItems(newModel4.getGrid().items, [
                [
                    new TestEnv.Item({
                        value: newWindow2,
                        rect: {
                            x: 350,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    new TestEnv.Item({
                        value: newWindow4,
                        rect: {
                            x: 450,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    new TestEnv.Item({
                        value: newWindow3,
                        rect: {
                            x: 550,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    new TestEnv.Item({
                        value: newWindow,
                        rect: {
                            x: 650,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
            ]);
        });

        it("should throw if the window is already in the model", () => {
            expect(() => model.insertWindow(windows[0])).toThrow();
        });

        it("should insert a window into a filled model", () => {
            const { model: newModel } = model.insertWindow(newWindow);

            testGridItems(newModel.getGrid().items, [
                [
                    // Column 0
                    new TestEnv.Item({
                        value: windows[0],
                        rect: {
                            x: 350,
                            y: 350,
                            width: 100,
                            height: 100,
                        },
                    }),
                    new TestEnv.Item({
                        value: windows[1],
                        rect: {
                            x: 400,
                            y: 450,
                            width: 50,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 1 (new and focused)
                    new TestEnv.Item({
                        value: newWindow,
                        rect: {
                            x: 450,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 2
                    new TestEnv.Item({
                        value: windows[2],
                        rect: {
                            x: 550,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 3
                    new TestEnv.Item({
                        value: windows[3],
                        rect: {
                            x: 650,
                            y: 475,
                            width: 50,
                            height: 50,
                        },
                    }),
                    new TestEnv.Item({
                        value: windows[4],
                        rect: {
                            x: 650,
                            y: 525,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 4
                    new TestEnv.Item({
                        value: windows[5],
                        rect: {
                            x: 750,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
            ]);
        });
    });

    describe("removeWindow", () => {
        const windows = createMockWindows();
        const model = createBaseModel(windows);

        it("should throw if the window is not in the model", () => {
            expect(() => model.removeWindow(createMockWindow(6))).toThrow();
        });

        it("should remove a window but not the column if it isn't the last window in it, then relayout", () => {
            const { model: newModel } = model.removeWindow(
                windows[0],
                windows[2],
            );

            testGridItems(newModel.getGrid().items, [
                [
                    // Column 0
                    new TestEnv.Item({
                        value: windows[1],
                        rect: {
                            x: 400,
                            y: 450,
                            width: 50,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 1 (Focused)
                    new TestEnv.Item({
                        value: windows[2],
                        rect: {
                            x: 450,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 2
                    new TestEnv.Item({
                        value: windows[3],
                        rect: {
                            x: 550,
                            y: 475,
                            width: 50,
                            height: 50,
                        },
                    }),
                    new TestEnv.Item({
                        value: windows[4],
                        rect: {
                            x: 550,
                            y: 525,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
                [
                    // Column 3
                    new TestEnv.Item({
                        value: windows[5],
                        rect: {
                            x: 650,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
            ]);
        });

        it("should remove a window and its column if it's the last window in it, then relayout", () => {
            const freshModel = new WorkspaceModel({
                workspaceModelManager: createMockWorkspaceModelManager([]),
                workArea: { x: 0, y: 0, width: 1000, height: 1000 },
            });
            const newWindow = createMockWindow(0);
            const newWindow2 = createMockWindow(1);
            const { model: oneWinModel } = freshModel.insertWindow(newWindow);
            const { model: twoWinModel } = oneWinModel.insertWindow(newWindow2);
            const { model: modelToTest } = twoWinModel.removeWindow(
                newWindow,
                newWindow2,
            );

            testGridItems(modelToTest.getGrid().items, [
                [
                    new TestEnv.Item({
                        value: newWindow2,
                        rect: {
                            x: 450,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
            ]);
        });

        it("should remove the last column if the window is the last window in the model", () => {
            const freshModel = new WorkspaceModel({
                workspaceModelManager: createMockWorkspaceModelManager([]),
                workArea: { x: 0, y: 0, width: 1000, height: 1000 },
            });
            const newWindow = createMockWindow(0);
            const { model: superFreshModel } =
                freshModel.insertWindow(newWindow);
            const { model: shouldBeEmptyModel } =
                superFreshModel.removeWindow(newWindow);

            testGridItems(shouldBeEmptyModel.getGrid().items, []);
        });
    });
});

vi.mock("../../../src/shell/utils/debug.js", () => {
    return {
        Debug: {
            assert: (ok) => {
                if (!ok) {
                    throw new Error();
                }
            },
            indentLog: () => {},
            dedentLog: () => {},
            log: () => {},
            warn: () => {},
            trace: () => {},
            error: () => {},
        },
    };
});

vi.mock("../../../src/shell/utils/settings.js", () => {
    return {
        Settings: {
            getWindowOpeningPosition: vi
                .fn(() => TestEnv.WindowOpeningPosition.LEFT)
                .mockImplementationOnce(
                    () => TestEnv.WindowOpeningPosition.LEFT,
                )
                .mockImplementationOnce(
                    () => TestEnv.WindowOpeningPosition.LEFT,
                )
                .mockImplementationOnce(
                    () => TestEnv.WindowOpeningPosition.RIGHT,
                )
                .mockImplementationOnce(
                    () => TestEnv.WindowOpeningPosition.BETWEEN_MRU,
                ),
            // TODO we need to test the different behaviors. But since I am
            // unsure about the behavior of floating windows in columns, let's
            // just wait for the implementation to be more stable.
            getFocusBehaviorMainAxis: () => 0,
            getFocusBehaviorCrossAxis: () => 0,
        },
    };
});

function testGridItems(items, expectedItems) {
    expect(items.length).toBe(expectedItems.length);

    for (let i = 0; i < items.length; i++) {
        const col = items[i];
        const expectedCol = expectedItems[i];

        expect(col.length).toBe(expectedCol.length);

        for (let j = 0; j < col.length; j++) {
            const item = col[j];
            const expectedItem = expectedCol[j];

            expect(item.value).toBe(expectedItem.value);
            expect(item.rect).toStrictEqual(expectedItem.rect);
        }
    }
}

function createMockWindow(id) {
    return {
        id,
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

function createMockWorkspaceModelManager(windows) {
    return {
        getWindows: () => windows,
    };
}

/**
 * @returns {WorkspaceModel}
 */
function createBaseModel(windows) {
    return new WorkspaceModel({
        workspaceModelManager: createMockWorkspaceModelManager(windows),
        focusedColumn: 1,
        workArea: {
            x: 0,
            y: 0,
            width: 1000,
            height: 1000,
        },
        columns: [
            // Column 0
            new TestEnv.Column({
                focusedItem: 1,
                items: [
                    new TestEnv.Item({
                        value: windows[0],
                        rect: {
                            x: 350,
                            y: 350,
                            width: 100,
                            height: 100,
                        },
                    }),
                    new TestEnv.Item({
                        value: windows[1],
                        rect: {
                            x: 400,
                            y: 450,
                            width: 50,
                            height: 100,
                        },
                    }),
                ],
            }),
            // Column 1 (Focused)
            new TestEnv.Column({
                focusedItem: 0,
                items: [
                    new TestEnv.Item({
                        value: windows[2],
                        rect: {
                            x: 450,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
            }),
            // Column 2
            new TestEnv.Column({
                focusedItem: 0,
                items: [
                    new TestEnv.Item({
                        value: windows[3],
                        rect: {
                            x: 550,
                            y: 475,
                            width: 50,
                            height: 50,
                        },
                    }),
                    new TestEnv.Item({
                        value: windows[4],
                        rect: {
                            x: 550,
                            y: 525,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
            }),
            // Column 3
            new TestEnv.Column({
                focusedItem: 0,
                items: [
                    new TestEnv.Item({
                        value: windows[5],
                        rect: {
                            x: 650,
                            y: 450,
                            width: 100,
                            height: 100,
                        },
                    }),
                ],
            }),
        ],
    });
}
