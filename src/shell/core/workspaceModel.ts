import { type Meta } from "../dependencies.js";

import {
    FocusBehavior,
    Rect,
    Result,
    WindowOpeningPosition,
} from "../../shared.js";
import { Debug } from "../utils/debug.js";
import { Settings } from "../utils/settings.js";
import { WorkspaceModelManager } from "./workspaceModelManager.js";
import { Signals } from "../dependencies.js";

// This type does not guarantee the non-emptiness via the type system. This is
// just a helper to make the type more descriptive. The guarantee should happen
// at runtime via JS when initializing and when removing items. There does not
// appear to be a way to encode non-empty arrays well in TypeScript. See https://stackoverflow.com/questions/56006111/is-it-possible-to-define-a-non-empty-array-type-in-typescript
type NonEmptyArray<T> = Array<T> & {
    [key: number]: T;
};

const ModelChangeErrors = Object.freeze({
    EMPTY_MODEL: "Destroying workspace model",
    NO_FOCUS_TARGET: "No target to focus on found",
    NO_ACTION_TARGET: "No target to act on found",
    NO_MOVEMENT_POSSIBLE:
        "No movement possible because item/col is already at the edge",
    ONLY_FOCUS_CHANGE:
        "Only focus change, which should be ignored, because a relayout will follow",
});

type ModelChangeErrors =
    (typeof ModelChangeErrors)[keyof typeof ModelChangeErrors];

class Item {
    public readonly value!: Meta.Window;
    public readonly rect!: Rect;
    private padding!: number;

    constructor({ value, rect }: { value: Meta.Window; rect: Rect }) {
        Debug.assert(
            value !== undefined,
            "Value must be defined (eg a Window).",
        );

        this.value = value;
        this.rect = rect;

        Settings.watch(
            "window-padding",
            () => {
                this.padding = Settings.getWindowPadding();
            },
            {
                tracker: this,
                immediate: true,
            },
        );
    }

    destroy() {
        Settings.unwatch(this);

        // @ts-expect-error null out
        this.value = null;
        // @ts-expect-error null out
        this.rect = null;
    }

    clone({
        value = this.value,
        rect = this.rect,
    }: {
        value?: Meta.Window;
        rect?: { x?: number; y?: number; width?: number; height?: number };
    } = {}) {
        return new Item({ value, rect: { ...this.rect, ...rect } });
    }

    contains(v: Meta.Window) {
        return v === this.value;
    }

    equals(otherItem: Item) {
        return this.value === otherItem.value;
    }

    getFocusedWindow() {
        return this.value;
    }

    sync() {
        const workArea = this.value.get_work_area_current_monitor();
        const windowActor =
            this.value.get_compositor_private() as Meta.WindowActor;

        // Windows cant be moved offscreen entirely: https://gitlab.gnome.org/GNOME/mutter/-/blob/main/src/core/constraints.c.
        // So just hide the actor if the window is meant to be offscreen but
        // constrained to be onscreen by mutter.
        const offScreenLimit = 75;
        const isOffScreen =
            this.rect.x + this.rect.width <= offScreenLimit ||
            this.rect.x >= workArea.x + workArea.width - offScreenLimit;

        if (isOffScreen) {
            windowActor.hide();
        } else {
            windowActor.show();
            this.value.move_resize_frame(
                true,
                workArea.x + this.rect.x + this.padding / 2,
                workArea.y + this.rect.y,
                this.rect.width - this.padding,
                this.rect.height,
            );
        }
    }
}

class Column {
    readonly focusedItem: number = 0;
    readonly items: NonEmptyArray<Item> = [];
    readonly rect: Rect;

    constructor({
        items,
        focusedItem = 0,
    }: {
        items: NonEmptyArray<Item>;
        focusedItem?: number;
    }) {
        Debug.assert(items.length > 0, "Items must be non-empty.");
        Debug.assert(
            focusedItem >= 0 && focusedItem < items.length,
            `focus must be a valid index: ${focusedItem}`,
        );

        this.focusedItem = focusedItem;
        this.items = items;
        this.rect = items.reduce(
            (acc, item) => {
                return {
                    x: Math.min(acc.x, item.rect.x),
                    y: Math.min(acc.y, item.rect.y),
                    width: Math.max(acc.width, item.rect.width),
                    height: acc.height + item.rect.height,
                };
            },
            {
                x: Infinity,
                y: Infinity,
                width: -Infinity,
                height: 0,
            },
        );
    }

    destroy() {
        // @ts-expect-error null out
        this.focusedItem = null;
        this.items.forEach((item) => item.destroy());
        // @ts-expect-error null out
        this.items = null;
        // @ts-expect-error null out
        this.rect = null;
    }

    clone({
        items = this.items.map((i) => i.clone()),
        focusedItem = this.focusedItem,
    } = {}) {
        return new Column({ items, focusedItem });
    }

    contains(v: Meta.Window) {
        return this.items.some((item) => item.contains(v));
    }

    equals(otherCol: Column) {
        return (
            this.items.length === otherCol.items.length &&
            this.items.every((item, i) => item.equals(otherCol.items[i]))
        );
    }

    getFocusedItem() {
        return this.items[this.focusedItem];
    }

    shift({ dx = 0, dy = 0 } = {}) {
        return new Column({
            focusedItem: this.focusedItem,
            items: this.items.map((item) => {
                return item.clone({
                    rect: { x: item.rect.x + dx, y: item.rect.y + dy },
                });
            }),
        });
    }
}

class WorkspaceGrid {
    readonly items: Item[][];
    readonly workArea: Rect;

    constructor({ items, workArea }: { items: Item[][]; workArea: Rect }) {
        this.items = items;
        this.workArea = workArea;
    }
}

class WorkspaceModel extends Signals.EventEmitter {
    static build({
        initialWindow,
    }: {
        initialWindow: Meta.Window;
    }): WorkspaceModel {
        const frameRect = initialWindow.get_frame_rect();
        const item = new Item({
            value: initialWindow,
            rect: {
                x: 0,
                y: 0,
                width: frameRect.width,
                height: frameRect.height,
            },
        });
        const unplacedModel = new WorkspaceModel({
            columns: [new Column({ items: [item] })],
            focusedColumn: 0,
            workArea: initialWindow.get_work_area_current_monitor(),
        });

        return unplacedModel.relayout(initialWindow).unwrap();
    }

    private readonly columns: NonEmptyArray<Column>;
    private readonly focusedColumn: number;
    private readonly workArea: Rect;

    constructor({
        columns,
        focusedColumn,
        workArea,
    }: {
        columns: NonEmptyArray<Column>;
        focusedColumn: number;
        workArea: Rect;
    }) {
        super();

        Debug.assert(
            Array.isArray(columns) &&
                columns.length > 0 &&
                columns.every((col) => col instanceof Column),
            `columns must be a non-empty array of columns. Current value is: ${columns}`,
        );

        this.columns = columns;
        this.focusedColumn = focusedColumn;
        this.workArea = workArea;
    }

    destroy() {
        this.columns.forEach((col) => col.destroy());
        // @ts-expect-error null out
        this.columns = null;

        // @ts-expect-error null out
        this.workArea = null;

        this.emit("destroy");
        this.disconnectAll();
    }

    clone({
        focusedColumn = this.focusedColumn,
        columns = this.columns.map((col) => col.clone()),
        workArea = this.workArea,
    }: {
        focusedColumn?: number;
        columns?: NonEmptyArray<Column>;
        workArea?: Rect;
    } = {}) {
        return new WorkspaceModel({
            columns,
            focusedColumn,
            workArea,
        });
    }

    getGrid() {
        return new WorkspaceGrid({
            workArea: this.workArea,
            items: this.columns.map((col) => {
                return col.items.map((item) => item.clone());
            }),
        });
    }

    relayout(window: Meta.Window): Result<WorkspaceModel> {
        const { focusedColumn: newFocusedColumn, focusedItem: newFocusItem } =
            this.findFocusedIndices(window);

        Debug.assert(
            newFocusedColumn !== undefined && newFocusItem !== undefined,
            `Window not found in workspace: ${window}`,
        );

        const placedCols = this.calculatePlacementOnMainAxis(
            newFocusedColumn,
            this.columns,
            this.workArea,
        );
        const placedFocusedCol = placedCols[newFocusedColumn];
        const placedItems = this.calculatePlacementOnCrossAxis(
            newFocusItem,
            placedFocusedCol.items,
            this.workArea,
        );

        return Result.Ok<WorkspaceModel>(
            new WorkspaceModel({
                columns: placedCols.with(
                    newFocusedColumn,
                    new Column({
                        items: placedItems,
                        focusedItem: newFocusItem,
                    }),
                ),
                focusedColumn: newFocusedColumn,
                workArea: this.workArea,
            }),
        );
    }

    focusItemOnLeft() {
        if (this.focusedColumn === 0) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_ACTION_TARGET,
            );
        }

        const newCol = this.columns[this.focusedColumn - 1];

        newCol.getFocusedItem().value.focus(global.get_current_time());

        return Result.Err<WorkspaceModel>(ModelChangeErrors.ONLY_FOCUS_CHANGE);
    }

    focusItemOnRight() {
        if (this.focusedColumn === this.columns.length - 1) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_ACTION_TARGET,
            );
        }

        const newCol = this.columns[this.focusedColumn + 1];

        newCol.getFocusedItem().value.focus(global.get_current_time());

        return Result.Err<WorkspaceModel>(ModelChangeErrors.ONLY_FOCUS_CHANGE);
    }

    focusItemAbove() {
        const currColumn = this.columns[this.focusedColumn];

        if (currColumn.focusedItem === 0) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_ACTION_TARGET,
            );
        }

        currColumn.items[currColumn.focusedItem - 1].value.focus(
            global.get_current_time(),
        );

        return Result.Err<WorkspaceModel>(ModelChangeErrors.ONLY_FOCUS_CHANGE);
    }

    focusItemBelow() {
        const currColumn = this.columns[this.focusedColumn];

        if (currColumn.focusedItem >= currColumn.items.length - 1) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_ACTION_TARGET,
            );
        }

        currColumn.items[currColumn.focusedItem + 1].value.focus(
            global.get_current_time(),
        );

        return Result.Err<WorkspaceModel>(ModelChangeErrors.ONLY_FOCUS_CHANGE);
    }

    moveFocusedColumnUp(): Result<WorkspaceModel> {
        // TODO multi-workspace movement
        return Result.Err<WorkspaceModel>(ModelChangeErrors.NO_ACTION_TARGET);
    }

    moveFocusedColumnDown(): Result<WorkspaceModel> {
        // TODO multi-workspace movement
        return Result.Err<WorkspaceModel>(ModelChangeErrors.NO_ACTION_TARGET);
    }

    moveFocusedColumnLeft(): Result<WorkspaceModel> {
        const col = this.columns[this.focusedColumn];

        if (this.focusedColumn === 0) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_MOVEMENT_POSSIBLE,
            );
        }

        const window = col.items[col.focusedItem].value;
        const model = new WorkspaceModel({
            workArea: this.workArea,
            focusedColumn: this.focusedColumn - 1,
            columns: [
                ...this.columns.slice(0, this.focusedColumn - 1),
                this.columns[this.focusedColumn],
                this.columns[this.focusedColumn - 1],
                ...this.columns.slice(this.focusedColumn + 1),
            ],
        });

        return model.relayout(window);
    }

    moveFocusedColumnRight(): Result<WorkspaceModel> {
        const col = this.columns[this.focusedColumn];

        if (this.focusedColumn >= this.columns.length - 1) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_MOVEMENT_POSSIBLE,
            );
        }

        const window = col.items[col.focusedItem].value;
        const model = new WorkspaceModel({
            workArea: this.workArea,
            focusedColumn: this.focusedColumn + 1,
            columns: [
                ...this.columns.slice(0, this.focusedColumn),
                this.columns[this.focusedColumn + 1],
                this.columns[this.focusedColumn],
                ...this.columns.slice(this.focusedColumn + 2),
            ],
        });

        return model.relayout(window);
    }

    moveFocusedItemUp(): Result<WorkspaceModel> {
        const currColumn = this.columns[this.focusedColumn];

        if (currColumn.focusedItem === 0) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_MOVEMENT_POSSIBLE,
            );
        }

        const model = new WorkspaceModel({
            workArea: this.workArea,
            focusedColumn: this.focusedColumn,
            columns: this.columns.with(
                this.focusedColumn,
                new Column({
                    focusedItem: currColumn.focusedItem - 1,
                    items: [
                        ...currColumn.items.slice(
                            0,
                            currColumn.focusedItem - 1,
                        ),
                        currColumn.items[currColumn.focusedItem],
                        currColumn.items[currColumn.focusedItem - 1],
                        ...currColumn.items.slice(currColumn.focusedItem + 1),
                    ],
                }),
            ),
        });

        return model.relayout(currColumn.items[currColumn.focusedItem].value);
    }

    moveFocusedItemDown(): Result<WorkspaceModel> {
        const currColumn = this.columns[this.focusedColumn];

        if (currColumn.focusedItem >= currColumn.items.length - 1) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_MOVEMENT_POSSIBLE,
            );
        }

        const model = new WorkspaceModel({
            workArea: this.workArea,
            focusedColumn: this.focusedColumn,
            columns: this.columns.with(
                this.focusedColumn,
                new Column({
                    focusedItem: currColumn.focusedItem + 1,
                    items: [
                        ...currColumn.items.slice(0, currColumn.focusedItem),
                        currColumn.items[currColumn.focusedItem + 1],
                        currColumn.items[currColumn.focusedItem],
                        ...currColumn.items.slice(currColumn.focusedItem + 2),
                    ],
                }),
            ),
        });

        return model.relayout(currColumn.items[currColumn.focusedItem].value);
    }

    moveFocusedItemLeft(): Result<WorkspaceModel> {
        const fromColumn = this.columns[this.focusedColumn];

        if (this.focusedColumn === 0 && fromColumn.items.length === 1) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_MOVEMENT_POSSIBLE,
            );
        }

        const maybeToColumn = this.columns[this.focusedColumn - 1];
        const toColumn =
            maybeToColumn?.clone({
                focusedItem: maybeToColumn.items.length,
                items: [...maybeToColumn.items, fromColumn.getFocusedItem()],
            }) ??
            new Column({
                focusedItem: 0,
                items: [fromColumn.getFocusedItem()],
            });

        const window = fromColumn.getFocusedItem().getFocusedWindow();
        const focusedItemInNewFromColumn = Math.max(
            0,
            fromColumn.focusedItem - 1,
        );
        const newFocusedColumn = Math.max(0, this.focusedColumn - 1);
        const fromColumnWasEmptied = fromColumn.items.length === 1;
        const newColumns =
            fromColumnWasEmptied ?
                [
                    ...this.columns.slice(0, newFocusedColumn),
                    toColumn,
                    ...this.columns.slice(this.focusedColumn + 1),
                ]
            :   [
                    ...this.columns.slice(0, newFocusedColumn),
                    toColumn,
                    new Column({
                        focusedItem: focusedItemInNewFromColumn,
                        items: this.calculatePlacementOnCrossAxis(
                            focusedItemInNewFromColumn,
                            fromColumn.items.toSpliced(
                                fromColumn.focusedItem,
                                1,
                            ),
                            this.workArea,
                        ),
                    }),
                    ...this.columns.slice(this.focusedColumn + 1),
                ];

        return new WorkspaceModel({
            columns: newColumns,
            focusedColumn: newFocusedColumn,
            workArea: this.workArea,
        }).relayout(window);
    }

    moveFocusedItemRight(): Result<WorkspaceModel> {
        const fromColumn = this.columns[this.focusedColumn];

        if (
            this.focusedColumn === this.columns.length - 1 &&
            fromColumn.items.length === 1
        ) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_MOVEMENT_POSSIBLE,
            );
        }

        const maybeToColumn = this.columns[this.focusedColumn + 1];
        const toColumn =
            maybeToColumn?.clone({
                focusedItem: maybeToColumn.items.length,
                items: [...maybeToColumn.items, fromColumn.getFocusedItem()],
            }) ??
            new Column({
                focusedItem: 0,
                items: [fromColumn.items[fromColumn.focusedItem]],
            });

        const window = fromColumn.getFocusedItem().getFocusedWindow();
        const focusedItemInNewFromColumn = Math.max(
            0,
            fromColumn.focusedItem - 1,
        );
        const fromColumnWasEmtpied = fromColumn.items.length === 1;
        const newColumns =
            fromColumnWasEmtpied ?
                [
                    ...this.columns.slice(0, this.focusedColumn),
                    toColumn,
                    ...this.columns.slice(this.focusedColumn + 2),
                ]
            :   [
                    ...this.columns.slice(0, this.focusedColumn),
                    new Column({
                        focusedItem: focusedItemInNewFromColumn,
                        items: this.calculatePlacementOnCrossAxis(
                            focusedItemInNewFromColumn,
                            fromColumn.items.toSpliced(
                                fromColumn.focusedItem,
                                1,
                            ),
                            this.workArea,
                        ),
                    }),
                    toColumn,
                    ...this.columns.slice(this.focusedColumn + 2),
                ];

        const addedANewColumn = newColumns.length > this.columns.length;

        return new WorkspaceModel({
            columns: newColumns,
            workArea: this.workArea,
            focusedColumn: this.focusedColumn + (addedANewColumn ? 1 : 0),
        }).relayout(window);
    }

    insertWindow(window: Meta.Window): Result<WorkspaceModel> {
        Debug.assert(
            this.columns.every(
                (col) => col.items.every((item) => item.value !== window),
                `Window (${window}) already in workspace`,
            ),
        );

        let cols;
        const openingPosition = Settings.getWindowOpeningPosition();
        const mrus = WorkspaceModelManager.getWindows().filter(
            (w) => w !== window,
        );

        if (openingPosition === WindowOpeningPosition.LEFT) {
            cols = this.insertWindowOnLeftOfFocus(
                window,
                mrus,
                this.columns,
                this.focusedColumn,
                this.workArea,
            );
        } else if (openingPosition === WindowOpeningPosition.RIGHT) {
            cols = this.insertWindowOnRightOfFocus(
                window,
                mrus,
                this.columns,
                this.focusedColumn,
                this.workArea,
            );
        } else if (openingPosition === WindowOpeningPosition.BETWEEN_MRU) {
            cols = this.insertWindowBetweenMrus(
                window,
                mrus,
                this.columns,
                this.focusedColumn,
                this.workArea,
            );
        } else {
            Debug.assert(
                false,
                `Unknown window opening position: ${openingPosition}`,
            );
        }

        return new WorkspaceModel({
            workArea: this.workArea,
            focusedColumn: -1, // will be set via relayout
            columns: cols,
        }).relayout(window);
    }

    removeWindow(
        window: Meta.Window,
        newFocus: Meta.Window | null,
    ): Result<WorkspaceModel> {
        if (this.columns.length === 1 && this.columns[0].items.length === 1) {
            this.destroy();

            return Result.Err<WorkspaceModel>(ModelChangeErrors.EMPTY_MODEL);
        }

        Debug.assert(
            newFocus !== null,
            "Missing new window to relayout around after removal",
        );

        const column = this.columns.find((column) => column.contains(window));

        Debug.assert(
            column !== undefined,
            `Window not found in workspace: ${window}`,
        );

        if (column.items.length === 1) {
            return new WorkspaceModel({
                workArea: this.workArea,
                focusedColumn: -1, // will be set via relayout
                columns: this.columns.filter((col) => col !== column),
            }).relayout(newFocus);
        }

        const index = column.items.findIndex((item) => item.value === window);
        const items = column.items.toSpliced(index, 1);
        const focusedItem = Math.min(column.focusedItem, items.length - 1);
        const newColumn = new Column({
            focusedItem: focusedItem,
            items: this.calculatePlacementOnCrossAxis(
                focusedItem,
                items,
                this.workArea,
            ),
        });

        return new WorkspaceModel({
            workArea: this.workArea,
            focusedColumn: -1, // will be set via relayout
            columns: this.columns.with(this.columns.indexOf(column), newColumn),
        }).relayout(newFocus);
    }

    private findFocusedIndices(window: Meta.Window) {
        const indices: {
            focusedColumn: number | undefined;
            focusedItem: number | undefined;
        } = { focusedColumn: undefined, focusedItem: undefined };

        for (let colIndex = 0; colIndex < this.columns.length; colIndex++) {
            const column = this.columns[colIndex];
            const itemIndex = column.items.findIndex((item) =>
                item.contains(window),
            );

            if (itemIndex !== -1) {
                indices.focusedColumn = colIndex;
                indices.focusedItem = itemIndex;
                break;
            }
        }

        return indices;
    }

    private calculateTotalWidth(columns: NonEmptyArray<Column>) {
        return columns.reduce((acc, col) => acc + col.rect.width, 0);
    }

    private calculateTotalHeight(items: NonEmptyArray<Item>) {
        return items.reduce((acc, item) => acc + item.rect.height, 0);
    }

    private alignColumns(
        index: number,
        columns: NonEmptyArray<Column>,
        resultCols: NonEmptyArray<Column>,
    ) {
        Debug.assert(
            columns[index].equals(resultCols[0]),
            "Provided column is not the column to align to",
        );

        Debug.assert(
            resultCols.length === 1,
            "No column that other columns should be aligned to was provided",
        );

        for (let i = index + 1; i < columns.length; i++) {
            const col = columns[i];
            const prevCol = resultCols.at(-1) as Column;

            resultCols.push(
                new Column({
                    focusedItem: col.focusedItem,
                    items: col.items.map((item) => {
                        return item.clone({
                            rect: { x: prevCol.rect.x + prevCol.rect.width },
                        });
                    }),
                }),
            );
        }

        for (let i = index - 1; i >= 0; i--) {
            const col = columns[i];
            const nextCol = resultCols[0];

            resultCols.unshift(
                new Column({
                    focusedItem: col.focusedItem,
                    items: col.items.map((item) => {
                        return item.clone({
                            rect: { x: nextCol.rect.x - item.rect.width },
                        });
                    }),
                }),
            );
        }

        return resultCols;
    }

    private alignItems(
        newFocusIndex: number,
        items: NonEmptyArray<Item>,
        resultItems: NonEmptyArray<Item>,
    ) {
        Debug.assert(
            items[newFocusIndex].equals(resultItems[0]),
            "Provided item is not the item to align to",
        );

        Debug.assert(
            resultItems.length === 1,
            "No item that other items should be aligned to was provided",
        );

        for (let i = newFocusIndex + 1; i < items.length; i++) {
            const item = items[i];
            const prevItem = resultItems.at(-1) as Item;

            resultItems.push(
                item.clone({
                    rect: { y: prevItem.rect.y + prevItem.rect.height },
                }),
            );
        }

        for (let i = newFocusIndex - 1; i >= 0; i--) {
            const item = items[i];
            const nextItem = resultItems[0];

            resultItems.unshift(
                item.clone({
                    rect: { y: nextItem.rect.y - item.rect.height },
                }),
            );
        }

        return resultItems;
    }

    private calculatePlacementOnMainAxis(
        newFocusColumn: number,
        columns: NonEmptyArray<Column>,
        workspace: Rect,
    ) {
        const focusBehaviorMainAxis = Settings.getFocusBehaviorMainAxis();

        if (focusBehaviorMainAxis === FocusBehavior.CENTER) {
            return this.centerOnMainAxis(newFocusColumn, columns, workspace);
        } else if (focusBehaviorMainAxis === FocusBehavior.LAZY_FOLLOW) {
            return this.lazyFollowOnMainAxis(
                newFocusColumn,
                columns,
                workspace,
            );
        }

        throw new Error(
            `Unknown focus behavior for main axis: ${focusBehaviorMainAxis}`,
        );
    }

    private calculatePlacementOnCrossAxis(
        newFocusItem: number,
        items: NonEmptyArray<Item>,
        workspace: Rect,
    ) {
        const focusBehaviorCrossAxis = Settings.getFocusBehaviorCrossAxis();

        if (focusBehaviorCrossAxis === FocusBehavior.CENTER) {
            return this.centerOnCrossAxis(newFocusItem, items, workspace);
        } else if (focusBehaviorCrossAxis === FocusBehavior.LAZY_FOLLOW) {
            return this.lazyFollowOnCrossAxis(newFocusItem, items, workspace);
        }

        throw new Error(
            `Unknown focus behavior for cross axis: ${focusBehaviorCrossAxis}`,
        );
    }

    private centerOnMainAxis(
        newFocusIndex: number,
        columns: NonEmptyArray<Column>,
        workspace: Rect,
    ) {
        const selectedCol = columns[newFocusIndex];
        const resultCols = [
            new Column({
                focusedItem: selectedCol.focusedItem,
                items: selectedCol.items.map((item) => {
                    return item.clone({
                        rect: {
                            x: Math.floor(
                                workspace.width / 2 - item.rect.width / 2,
                            ),
                        },
                    });
                }),
            }),
        ];

        return this.alignColumns(newFocusIndex, columns, resultCols);
    }

    private centerOnCrossAxis(
        newFocusIndex: number,
        items: NonEmptyArray<Item>,
        workspace: Rect,
    ) {
        const selectedItem = items[newFocusIndex];
        const resultItems = [
            selectedItem.clone({
                rect: {
                    y: Math.floor(
                        workspace.height / 2 - selectedItem.rect.height / 2,
                    ),
                },
            }),
        ];

        return this.alignItems(newFocusIndex, items, resultItems);
    }

    private lazyFollowOnMainAxis(
        newFocusColumn: number,
        columns: NonEmptyArray<Column>,
        workspace: Rect,
    ) {
        const mrus = WorkspaceModelManager.getWindows();
        const visibleColumns = [columns[newFocusColumn]];

        while (true) {
            const leftMostVisibleCol = visibleColumns[0];
            const rightMostVisibleCol = visibleColumns.at(-1) as Column;
            const leftNeighborIndex = columns.indexOf(leftMostVisibleCol) - 1;
            const rightNeighborIndex = columns.indexOf(rightMostVisibleCol) + 1;
            const maybeLeftNeighborOfVisible = columns[leftNeighborIndex];
            const maybeRightNeighborOfVisible = columns[rightNeighborIndex];

            if (
                maybeLeftNeighborOfVisible !== undefined &&
                maybeRightNeighborOfVisible !== undefined
            ) {
                const mruPositionOfLeftNeighbor = mrus.indexOf(
                    maybeLeftNeighborOfVisible
                        .getFocusedItem()
                        .getFocusedWindow(),
                );
                const mruPositionOfRightNeighbor = mrus.indexOf(
                    maybeRightNeighborOfVisible
                        .getFocusedItem()
                        .getFocusedWindow(),
                );

                if (mruPositionOfLeftNeighbor < mruPositionOfRightNeighbor) {
                    visibleColumns.unshift(maybeLeftNeighborOfVisible);

                    if (
                        this.calculateTotalWidth(visibleColumns) >
                        workspace.width
                    ) {
                        return this.alignToRightMostColForLazyFollowOnMainAxis(
                            visibleColumns.at(-1) as Column,
                            columns,
                            workspace,
                        );
                    }
                } else {
                    visibleColumns.push(maybeRightNeighborOfVisible);

                    if (
                        this.calculateTotalWidth(visibleColumns) >
                        workspace.width
                    ) {
                        return this.alignToLeftMostColForLazyFollowOnMainAxis(
                            visibleColumns[0],
                            columns,
                        );
                    }
                }
            } else if (maybeLeftNeighborOfVisible !== undefined) {
                visibleColumns.unshift(maybeLeftNeighborOfVisible);

                if (
                    this.calculateTotalWidth(visibleColumns) > workspace.width
                ) {
                    return this.alignToRightMostColForLazyFollowOnMainAxis(
                        visibleColumns.at(-1) as Column,
                        columns,
                        workspace,
                    );
                }
            } else if (maybeRightNeighborOfVisible !== undefined) {
                visibleColumns.push(maybeRightNeighborOfVisible);

                if (
                    this.calculateTotalWidth(visibleColumns) > workspace.width
                ) {
                    return this.alignToLeftMostColForLazyFollowOnMainAxis(
                        visibleColumns[0],
                        columns,
                    );
                }
            } else {
                return this.centerAllColumnsOnMainAxis(columns, workspace);
            }
        }
    }

    private centerAllColumnsOnMainAxis(
        columns: NonEmptyArray<Column>,
        workspace: Rect,
    ) {
        const totalWidth = this.calculateTotalWidth(columns);
        const [firstCol] = columns;
        const placedFirstCol = new Column({
            focusedItem: firstCol.focusedItem,
            items: firstCol.items.map((item) => {
                return item.clone({
                    rect: {
                        x: Math.floor(workspace.width / 2 - totalWidth / 2),
                    },
                });
            }),
        });

        return this.alignColumns(0, columns, [placedFirstCol]);
    }

    private alignToLeftMostColForLazyFollowOnMainAxis(
        leftMostFullyVisColumn: Column,
        columns: NonEmptyArray<Column>,
    ) {
        const leftMostIndex = columns.indexOf(leftMostFullyVisColumn);
        const windowsOffscreenOnLeft = leftMostIndex > 0;
        const peekingAmount =
            windowsOffscreenOnLeft ? Settings.getWindowPeeking() : 0;
        const placedCol = new Column({
            focusedItem: leftMostFullyVisColumn.focusedItem,
            items: leftMostFullyVisColumn.items.map((item) => {
                return item.clone({
                    rect: {
                        x:
                            leftMostFullyVisColumn.rect.width -
                            item.rect.width +
                            peekingAmount,
                    },
                });
            }),
        });

        return this.alignColumns(leftMostIndex, columns, [placedCol]);
    }

    private alignToRightMostColForLazyFollowOnMainAxis(
        rightMostFullyVisColumn: Column,
        columns: NonEmptyArray<Column>,
        workspace: Rect,
    ) {
        const rightMostIndex = columns.indexOf(rightMostFullyVisColumn);
        const windowsOffscreenOnRight = rightMostIndex < columns.length - 1;
        const peekingAmount =
            windowsOffscreenOnRight ? Settings.getWindowPeeking() : 0;
        const placedCol = new Column({
            focusedItem: rightMostFullyVisColumn.focusedItem,
            items: rightMostFullyVisColumn.items.map((item) => {
                return item.clone({
                    rect: {
                        x:
                            workspace.width -
                            rightMostFullyVisColumn.rect.width -
                            peekingAmount,
                    },
                });
            }),
        });

        return this.alignColumns(rightMostIndex, columns, [placedCol]);
    }

    private lazyFollowOnCrossAxis(
        newFocusItem: number,
        items: NonEmptyArray<Item>,
        workspace: Rect,
    ) {
        const mrus = WorkspaceModelManager.getWindows();
        const visibleItems = [items[newFocusItem]];

        while (true) {
            const topMostVisibleItem = visibleItems[0];
            const bottomMostVisibleItem = visibleItems.at(-1) as Item;
            const aboveIndex = items.indexOf(topMostVisibleItem) - 1;
            const maybeAboveNeighborOfVisible = items[aboveIndex];
            const belowIndex = items.indexOf(bottomMostVisibleItem) + 1;
            const maybeBottomNeighborOfVisible = items[belowIndex];

            if (
                maybeAboveNeighborOfVisible !== undefined &&
                maybeBottomNeighborOfVisible !== undefined
            ) {
                const mruPositionOfLeftNeighbor = mrus.indexOf(
                    maybeAboveNeighborOfVisible.getFocusedWindow(),
                );
                const mruPositionOfRightNeighbor = mrus.indexOf(
                    maybeBottomNeighborOfVisible.getFocusedWindow(),
                );

                if (mruPositionOfLeftNeighbor < mruPositionOfRightNeighbor) {
                    visibleItems.unshift(maybeAboveNeighborOfVisible);

                    if (
                        this.calculateTotalHeight(visibleItems) >
                        workspace.height
                    ) {
                        return this.alignToBottomMostItemForLazyFollowOnCrossAxis(
                            visibleItems.at(-1) as Item,
                            items,
                            workspace,
                        );
                    }
                } else {
                    visibleItems.push(maybeBottomNeighborOfVisible);

                    if (
                        this.calculateTotalHeight(visibleItems) >
                        workspace.height
                    ) {
                        return this.alignToTopMostItemForLazyFollowOnCrossAxis(
                            visibleItems[0],
                            items,
                        );
                    }
                }
            } else if (maybeAboveNeighborOfVisible !== undefined) {
                visibleItems.unshift(maybeAboveNeighborOfVisible);

                if (
                    this.calculateTotalHeight(visibleItems) > workspace.height
                ) {
                    return this.alignToBottomMostItemForLazyFollowOnCrossAxis(
                        visibleItems.at(-1) as Item,
                        items,
                        workspace,
                    );
                }
            } else if (maybeBottomNeighborOfVisible !== undefined) {
                visibleItems.push(maybeBottomNeighborOfVisible);

                if (
                    this.calculateTotalHeight(visibleItems) > workspace.height
                ) {
                    return this.alignToTopMostItemForLazyFollowOnCrossAxis(
                        visibleItems[0],
                        items,
                    );
                }
            } else {
                return this.centerAllItemsOnCrossAxis(items, workspace);
            }
        }
    }

    private alignToTopMostItemForLazyFollowOnCrossAxis(
        topMostItem: Item,
        items: NonEmptyArray<Item>,
    ) {
        const topMostIndex = items.indexOf(topMostItem);
        const placedItem = topMostItem.clone({ rect: { y: 0 } });

        return this.alignItems(topMostIndex, items, [placedItem]);
    }

    private alignToBottomMostItemForLazyFollowOnCrossAxis(
        bottomMostItem: Item,
        items: NonEmptyArray<Item>,
        workspace: Rect,
    ) {
        const bottomMostIndex = items.indexOf(bottomMostItem);
        const placedItem = bottomMostItem.clone({
            rect: { y: workspace.height - bottomMostItem.rect.height },
        });

        return this.alignItems(bottomMostIndex, items, [placedItem]);
    }

    private centerAllItemsOnCrossAxis(
        items: NonEmptyArray<Item>,
        workspace: Rect,
    ) {
        const totalHeight = this.calculateTotalHeight(items);
        const [firstItem] = items;
        const placedFirstItem = firstItem.clone({
            rect: { y: Math.floor(workspace.height / 2 - totalHeight / 2) },
        });

        return this.alignItems(0, items, [placedFirstItem]);
    }

    private insertWindowOnLeftOfFocus(
        window: Meta.Window,
        mrus: Meta.Window[],
        columns: NonEmptyArray<Column>,
        focusedColumn: number,
        workspace: Rect,
    ) {
        const windowFrame = window.get_frame_rect();
        const [prevFocusedWindow] = mrus;
        const prevCol =
            prevFocusedWindow &&
            columns.find((col) => col.contains(prevFocusedWindow));
        const newColumn = new Column({
            focusedItem: 0,
            items: [
                new Item({
                    value: window,
                    rect: {
                        x: prevCol ? prevCol.rect.x - windowFrame.width : 0,
                        y: Math.floor(
                            workspace.height / 2 - windowFrame.height / 2,
                        ),
                        width: windowFrame.width,
                        height: windowFrame.height,
                    },
                }),
            ],
        });

        return [
            ...columns.slice(0, focusedColumn),
            newColumn,
            ...columns.slice(focusedColumn),
        ];
    }

    private insertWindowOnRightOfFocus(
        window: Meta.Window,
        mrus: Meta.Window[],
        columns: NonEmptyArray<Column>,
        focusedColumn: number,
        workspace: Rect,
    ) {
        const windowFrame = window.get_frame_rect();
        const [prevFocusedWindow] = mrus;
        const prevCol =
            prevFocusedWindow &&
            columns.find((col) => col.contains(prevFocusedWindow));
        const newColumn = new Column({
            focusedItem: 0,
            items: [
                new Item({
                    value: window,
                    rect: {
                        x: prevCol ? prevCol.rect.x + windowFrame.width : 0,
                        y: Math.floor(
                            workspace.height / 2 - windowFrame.height / 2,
                        ),
                        width: windowFrame.width,
                        height: windowFrame.height,
                    },
                }),
            ],
        });

        return [
            ...columns.slice(0, focusedColumn + 1),
            newColumn,
            ...columns.slice(focusedColumn + 1),
        ];
    }

    private insertWindowBetweenMrus(
        window: Meta.Window,
        mrus: Meta.Window[],
        columns: NonEmptyArray<Column>,
        focusedColumn: number,
        workspace: Rect,
    ) {
        const [prevFocusedWindow, prevPrevFocusedWindow] = mrus;

        if (prevPrevFocusedWindow === undefined) {
            return this.insertWindowOnLeftOfFocus(
                window,
                mrus,
                columns,
                focusedColumn,
                workspace,
            );
        }

        const prevCol = columns.find((col) => col.contains(prevFocusedWindow));
        const prevPrevCol = columns.find((col) =>
            col.contains(prevPrevFocusedWindow),
        );

        Debug.assert(
            prevCol !== undefined && prevPrevCol !== undefined,
            "MRUs not found in workspace",
        );

        const direction = prevCol.rect.x - prevPrevCol.rect.x;

        if (direction > 0) {
            return this.insertWindowOnLeftOfFocus(
                window,
                mrus,
                columns,
                focusedColumn,
                workspace,
            );
        } else {
            return this.insertWindowOnRightOfFocus(
                window,
                mrus,
                columns,
                focusedColumn,
                workspace,
            );
        }
    }
}

let TestEnv;

// @ts-expect-error globalThis.process only exists in node but not in GNOME. So
// let's just ignore the `any` type error since it's such a small part.
if (globalThis.process?.env.NODE_ENV === "test") {
    TestEnv = {
        Column,
        Item,
        WindowOpeningPosition,
    };
}

export {
    TestEnv,
    WorkspaceModel,
    ModelChangeErrors as WorkspaceModelChangeErrors,
};
