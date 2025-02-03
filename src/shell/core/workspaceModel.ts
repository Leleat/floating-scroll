import { type Meta } from "../dependencies.js";

import {
    FocusBehavior,
    Rect,
    Result,
    WindowOpeningPosition,
} from "../../shared.js";
import { Debug, decorateFnWithLog } from "../utils/debug.js";
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
        "No movement possible because cell/col is already at the edge",
    ONLY_FOCUS_CHANGE:
        "Only focus change, which should be ignored, because a relayout will follow",
});

type ModelChangeErrors =
    (typeof ModelChangeErrors)[keyof typeof ModelChangeErrors];

class Cell {
    readonly value!: Meta.Window;
    readonly rect!: Rect;

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

    @decorateFnWithLog("log", "Cell")
    destroy() {
        Settings.unwatch(this);

        // @ts-expect-error null out
        this.value = null;
        // @ts-expect-error null out
        this.rect = null;
    }

    @decorateFnWithLog("log", "Cell")
    clone({
        value = this.value,
        rect = this.rect,
    }: {
        value?: Meta.Window;
        rect?: { x?: number; y?: number; width?: number; height?: number };
    } = {}) {
        return new Cell({ value, rect: { ...this.rect, ...rect } });
    }

    @decorateFnWithLog("log", "Cell")
    contains(v: Meta.Window) {
        return v === this.value;
    }

    @decorateFnWithLog("log", "Cell")
    equals(otherCell: Cell) {
        return this.value === otherCell.value;
    }

    @decorateFnWithLog("log", "Cell")
    getSelectedWindow() {
        return this.value;
    }

    @decorateFnWithLog("log", "Cell")
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
    readonly cells: NonEmptyArray<Cell> = [];
    readonly selected: number = 0;
    readonly rect: Rect;

    constructor({
        cells,
        selected = 0,
    }: {
        cells: NonEmptyArray<Cell>;
        selected: number;
    }) {
        Debug.assert(cells.length > 0, "Cells must be non-empty.");
        Debug.assert(
            selected >= 0 && selected < cells.length,
            `Selection must be a valid index: ${selected}`,
        );

        this.selected = selected;
        this.cells = cells;
        this.rect = cells.reduce(
            (acc, cell) => {
                return {
                    x: Math.min(acc.x, cell.rect.x),
                    y: Math.min(acc.y, cell.rect.y),
                    width: Math.max(acc.width, cell.rect.width),
                    height: acc.height + cell.rect.height,
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

    @decorateFnWithLog("log", "Column")
    destroy() {
        // @ts-expect-error null out
        this.selected = null;
        this.cells.forEach((c) => c.destroy());
        // @ts-expect-error null out
        this.cells = null;
        // @ts-expect-error null out
        this.rect = null;
    }

    @decorateFnWithLog("log", "Column")
    clone({
        cells = this.cells.map((i) => i.clone()),
        selected = this.selected,
    } = {}) {
        return new Column({ cells, selected });
    }

    @decorateFnWithLog("log", "Column")
    contains(v: Meta.Window) {
        return this.cells.some((c) => c.contains(v));
    }

    @decorateFnWithLog("log", "Column")
    equals(otherCol: Column) {
        return (
            this.cells.length === otherCol.cells.length &&
            this.cells.every((c, i) => c.equals(otherCol.cells[i]))
        );
    }

    @decorateFnWithLog("log", "Column")
    getSelectedCell() {
        return this.cells[this.selected];
    }

    @decorateFnWithLog("log", "Column")
    shift({ dx = 0, dy = 0 } = {}) {
        return new Column({
            selected: this.selected,
            cells: this.cells.map((cell) => {
                return cell.clone({
                    rect: { x: cell.rect.x + dx, y: cell.rect.y + dy },
                });
            }),
        });
    }
}

class WorkspaceGrid {
    readonly cells: Cell[][];
    readonly workArea: Rect;

    constructor({ cells, workArea }: { cells: Cell[][]; workArea: Rect }) {
        this.cells = cells;
        this.workArea = workArea;
    }
}

class WorkspaceModel extends Signals.EventEmitter {
    @decorateFnWithLog("log", "WorkspaceModel")
    static build({
        initialWindow,
    }: {
        initialWindow: Meta.Window;
    }): WorkspaceModel {
        const frameRect = initialWindow.get_frame_rect();
        const cell = new Cell({
            value: initialWindow,
            rect: {
                x: 0,
                y: 0,
                width: frameRect.width,
                height: frameRect.height,
            },
        });
        const unplacedModel = new WorkspaceModel({
            columns: [new Column({ cells: [cell], selected: 0 })],
            selected: 0,
            workArea: initialWindow.get_work_area_current_monitor(),
        });

        return unplacedModel.relayout(initialWindow).unwrap();
    }

    private readonly columns: NonEmptyArray<Column>;
    private readonly selected: number;
    private readonly workArea: Rect;

    constructor({
        columns,
        selected,
        workArea,
    }: {
        columns: NonEmptyArray<Column>;
        selected: number;
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
        this.selected = selected;
        this.workArea = workArea;
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    destroy() {
        this.columns.forEach((col) => col.destroy());
        // @ts-expect-error null out
        this.columns = null;

        // @ts-expect-error null out
        this.workArea = null;

        this.emit("destroy");
        this.disconnectAll();
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    clone({
        selected = this.selected,
        columns = this.columns.map((col) => col.clone()),
        workArea = this.workArea,
    }: {
        selected?: number;
        columns?: NonEmptyArray<Column>;
        workArea?: Rect;
    } = {}) {
        return new WorkspaceModel({
            columns,
            selected,
            workArea,
        });
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    getGrid() {
        return new WorkspaceGrid({
            workArea: this.workArea,
            cells: this.columns.map((col) => {
                return col.cells.map((c) => c.clone());
            }),
        });
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    relayout(window: Meta.Window): Result<WorkspaceModel> {
        const {
            selectedColumn: newSelectedColIdx,
            selectedCell: newSelectedCellIdx,
        } = this.findSelectedIndices(window);

        Debug.assert(
            newSelectedColIdx !== undefined && newSelectedCellIdx !== undefined,
            `Window not found in workspace: ${window}`,
        );

        const placedCols = this.calculatePlacementOnMainAxis(
            newSelectedColIdx,
            this.columns,
            this.workArea,
        );
        const placedSelectedCol = placedCols[newSelectedColIdx];
        const placedCells = this.calculatePlacementOnCrossAxis(
            newSelectedCellIdx,
            placedSelectedCol.cells,
            this.workArea,
        );

        return Result.Ok<WorkspaceModel>(
            new WorkspaceModel({
                columns: placedCols.with(
                    newSelectedColIdx,
                    new Column({
                        cells: placedCells,
                        selected: newSelectedCellIdx,
                    }),
                ),
                selected: newSelectedColIdx,
                workArea: this.workArea,
            }),
        );
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    focusItemOnLeft() {
        if (this.selected === 0) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_ACTION_TARGET,
            );
        }

        const newCol = this.columns[this.selected - 1];

        newCol.getSelectedCell().value.focus(global.get_current_time());

        return Result.Err<WorkspaceModel>(ModelChangeErrors.ONLY_FOCUS_CHANGE);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    focusItemOnRight() {
        if (this.selected === this.columns.length - 1) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_ACTION_TARGET,
            );
        }

        const newCol = this.columns[this.selected + 1];

        newCol.getSelectedCell().value.focus(global.get_current_time());

        return Result.Err<WorkspaceModel>(ModelChangeErrors.ONLY_FOCUS_CHANGE);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    focusItemAbove() {
        const currColumn = this.columns[this.selected];

        if (currColumn.selected === 0) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_ACTION_TARGET,
            );
        }

        currColumn.cells[currColumn.selected - 1].value.focus(
            global.get_current_time(),
        );

        return Result.Err<WorkspaceModel>(ModelChangeErrors.ONLY_FOCUS_CHANGE);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    focusItemBelow() {
        const currColumn = this.columns[this.selected];

        if (currColumn.selected >= currColumn.cells.length - 1) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_ACTION_TARGET,
            );
        }

        currColumn.cells[currColumn.selected + 1].value.focus(
            global.get_current_time(),
        );

        return Result.Err<WorkspaceModel>(ModelChangeErrors.ONLY_FOCUS_CHANGE);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    moveFocusedColumnUp(): Result<WorkspaceModel> {
        // TODO multi-workspace movement
        return Result.Err<WorkspaceModel>(ModelChangeErrors.NO_ACTION_TARGET);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    moveFocusedColumnDown(): Result<WorkspaceModel> {
        // TODO multi-workspace movement
        return Result.Err<WorkspaceModel>(ModelChangeErrors.NO_ACTION_TARGET);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    moveFocusedColumnLeft(): Result<WorkspaceModel> {
        const col = this.columns[this.selected];

        if (this.selected === 0) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_MOVEMENT_POSSIBLE,
            );
        }

        const window = col.cells[col.selected].value;
        const model = new WorkspaceModel({
            workArea: this.workArea,
            selected: this.selected - 1,
            columns: [
                ...this.columns.slice(0, this.selected - 1),
                this.columns[this.selected],
                this.columns[this.selected - 1],
                ...this.columns.slice(this.selected + 1),
            ],
        });

        return model.relayout(window);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    moveFocusedColumnRight(): Result<WorkspaceModel> {
        const col = this.columns[this.selected];

        if (this.selected >= this.columns.length - 1) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_MOVEMENT_POSSIBLE,
            );
        }

        const window = col.cells[col.selected].value;
        const model = new WorkspaceModel({
            workArea: this.workArea,
            selected: this.selected + 1,
            columns: [
                ...this.columns.slice(0, this.selected),
                this.columns[this.selected + 1],
                this.columns[this.selected],
                ...this.columns.slice(this.selected + 2),
            ],
        });

        return model.relayout(window);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    moveFocusedItemUp(): Result<WorkspaceModel> {
        const currColumn = this.columns[this.selected];

        if (currColumn.selected === 0) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_MOVEMENT_POSSIBLE,
            );
        }

        const model = new WorkspaceModel({
            workArea: this.workArea,
            selected: this.selected,
            columns: this.columns.with(
                this.selected,
                new Column({
                    selected: currColumn.selected - 1,
                    cells: [
                        ...currColumn.cells.slice(0, currColumn.selected - 1),
                        currColumn.cells[currColumn.selected],
                        currColumn.cells[currColumn.selected - 1],
                        ...currColumn.cells.slice(currColumn.selected + 1),
                    ],
                }),
            ),
        });

        return model.relayout(currColumn.cells[currColumn.selected].value);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    moveFocusedItemDown(): Result<WorkspaceModel> {
        const currColumn = this.columns[this.selected];

        if (currColumn.selected >= currColumn.cells.length - 1) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_MOVEMENT_POSSIBLE,
            );
        }

        const model = new WorkspaceModel({
            workArea: this.workArea,
            selected: this.selected,
            columns: this.columns.with(
                this.selected,
                new Column({
                    selected: currColumn.selected + 1,
                    cells: [
                        ...currColumn.cells.slice(0, currColumn.selected),
                        currColumn.cells[currColumn.selected + 1],
                        currColumn.cells[currColumn.selected],
                        ...currColumn.cells.slice(currColumn.selected + 2),
                    ],
                }),
            ),
        });

        return model.relayout(currColumn.cells[currColumn.selected].value);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    moveFocusedItemLeft(): Result<WorkspaceModel> {
        const fromColumn = this.columns[this.selected];

        if (this.selected === 0 && fromColumn.cells.length === 1) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_MOVEMENT_POSSIBLE,
            );
        }

        const maybeToColumn = this.columns[this.selected - 1];
        const toColumn =
            maybeToColumn?.clone({
                selected: maybeToColumn.cells.length,
                cells: [...maybeToColumn.cells, fromColumn.getSelectedCell()],
            }) ??
            new Column({
                selected: 0,
                cells: [fromColumn.getSelectedCell()],
            });

        const window = fromColumn.getSelectedCell().getSelectedWindow();
        const seclectionInNewFromColumn = Math.max(0, fromColumn.selected - 1);
        const newSelectedColIdx = Math.max(0, this.selected - 1);
        const fromColumnWasEmptied = fromColumn.cells.length === 1;
        const newColumns =
            fromColumnWasEmptied ?
                [
                    ...this.columns.slice(0, newSelectedColIdx),
                    toColumn,
                    ...this.columns.slice(this.selected + 1),
                ]
            :   [
                    ...this.columns.slice(0, newSelectedColIdx),
                    toColumn,
                    new Column({
                        selected: seclectionInNewFromColumn,
                        cells: this.calculatePlacementOnCrossAxis(
                            seclectionInNewFromColumn,
                            fromColumn.cells.toSpliced(fromColumn.selected, 1),
                            this.workArea,
                        ),
                    }),
                    ...this.columns.slice(this.selected + 1),
                ];

        return new WorkspaceModel({
            columns: newColumns,
            selected: newSelectedColIdx,
            workArea: this.workArea,
        }).relayout(window);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    moveFocusedItemRight(): Result<WorkspaceModel> {
        const fromColumn = this.columns[this.selected];

        if (
            this.selected === this.columns.length - 1 &&
            fromColumn.cells.length === 1
        ) {
            return Result.Err<WorkspaceModel>(
                ModelChangeErrors.NO_MOVEMENT_POSSIBLE,
            );
        }

        const maybeToColumn = this.columns[this.selected + 1];
        const toColumn =
            maybeToColumn?.clone({
                selected: maybeToColumn.cells.length,
                cells: [...maybeToColumn.cells, fromColumn.getSelectedCell()],
            }) ??
            new Column({
                selected: 0,
                cells: [fromColumn.cells[fromColumn.selected]],
            });

        const window = fromColumn.getSelectedCell().getSelectedWindow();
        const selectionInNewFromColumn = Math.max(0, fromColumn.selected - 1);
        const fromColumnWasEmtpied = fromColumn.cells.length === 1;
        const newColumns =
            fromColumnWasEmtpied ?
                [
                    ...this.columns.slice(0, this.selected),
                    toColumn,
                    ...this.columns.slice(this.selected + 2),
                ]
            :   [
                    ...this.columns.slice(0, this.selected),
                    new Column({
                        selected: selectionInNewFromColumn,
                        cells: this.calculatePlacementOnCrossAxis(
                            selectionInNewFromColumn,
                            fromColumn.cells.toSpliced(fromColumn.selected, 1),
                            this.workArea,
                        ),
                    }),
                    toColumn,
                    ...this.columns.slice(this.selected + 2),
                ];

        const addedANewColumn = newColumns.length > this.columns.length;

        return new WorkspaceModel({
            columns: newColumns,
            workArea: this.workArea,
            selected: this.selected + (addedANewColumn ? 1 : 0),
        }).relayout(window);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    insertWindow(window: Meta.Window): Result<WorkspaceModel> {
        Debug.assert(
            this.columns.every(
                (col) => col.cells.every((c) => c.value !== window),
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
                this.selected,
                this.workArea,
            );
        } else if (openingPosition === WindowOpeningPosition.RIGHT) {
            cols = this.insertWindowOnRightOfFocus(
                window,
                mrus,
                this.columns,
                this.selected,
                this.workArea,
            );
        } else if (openingPosition === WindowOpeningPosition.BETWEEN_MRU) {
            cols = this.insertWindowBetweenMrus(
                window,
                mrus,
                this.columns,
                this.selected,
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
            selected: -1, // will be set via relayout
            columns: cols,
        }).relayout(window);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    removeWindow(
        window: Meta.Window,
        newFocus: Meta.Window | null,
    ): Result<WorkspaceModel> {
        if (this.columns.length === 1 && this.columns[0].cells.length === 1) {
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

        if (column.cells.length === 1) {
            return new WorkspaceModel({
                workArea: this.workArea,
                selected: -1, // will be set via relayout
                columns: this.columns.filter((col) => col !== column),
            }).relayout(newFocus);
        }

        const index = column.cells.findIndex((c) => c.value === window);
        const cells = column.cells.toSpliced(index, 1);
        const selectedCell = Math.min(column.selected, cells.length - 1);
        const newColumn = new Column({
            selected: selectedCell,
            cells: this.calculatePlacementOnCrossAxis(
                selectedCell,
                cells,
                this.workArea,
            ),
        });

        return new WorkspaceModel({
            workArea: this.workArea,
            selected: -1, // will be set via relayout
            columns: this.columns.with(this.columns.indexOf(column), newColumn),
        }).relayout(newFocus);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private findSelectedIndices(window: Meta.Window) {
        const indices: {
            selectedColumn: number | undefined;
            selectedCell: number | undefined;
        } = { selectedColumn: undefined, selectedCell: undefined };

        for (let colIndex = 0; colIndex < this.columns.length; colIndex++) {
            const column = this.columns[colIndex];
            const cellIndex = column.cells.findIndex((cell) =>
                cell.contains(window),
            );

            if (cellIndex !== -1) {
                indices.selectedColumn = colIndex;
                indices.selectedCell = cellIndex;
                break;
            }
        }

        return indices;
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private calculateTotalWidth<T extends { rect: Rect }>(
        items: NonEmptyArray<T>,
    ) {
        return items.reduce((acc, col) => acc + col.rect.width, 0);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private calculateTotalHeight<T extends { rect: Rect }>(
        items: NonEmptyArray<T>,
    ) {
        return items.reduce((acc, item) => acc + item.rect.height, 0);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
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
                    selected: col.selected,
                    cells: col.cells.map((cell) => {
                        return cell.clone({
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
                    selected: col.selected,
                    cells: col.cells.map((cell) => {
                        return cell.clone({
                            rect: { x: nextCol.rect.x - cell.rect.width },
                        });
                    }),
                }),
            );
        }

        return resultCols;
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private alignCells(
        newSelectedIndex: number,
        cells: NonEmptyArray<Cell>,
        result: NonEmptyArray<Cell>,
    ) {
        Debug.assert(
            cells[newSelectedIndex].equals(result[0]),
            "Provided cell is not the cell to align to",
        );

        Debug.assert(
            result.length === 1,
            "No cell that other cells should be aligned to was provided",
        );

        for (let i = newSelectedIndex + 1; i < cells.length; i++) {
            const cell = cells[i];
            const prevCell = result.at(-1) as Cell;

            result.push(
                cell.clone({
                    rect: { y: prevCell.rect.y + prevCell.rect.height },
                }),
            );
        }

        for (let i = newSelectedIndex - 1; i >= 0; i--) {
            const cell = cells[i];
            const nextCell = result[0];

            result.unshift(
                cell.clone({
                    rect: { y: nextCell.rect.y - cell.rect.height },
                }),
            );
        }

        return result;
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private calculatePlacementOnMainAxis(
        newSelectedColIndex: number,
        columns: NonEmptyArray<Column>,
        workspace: Rect,
    ) {
        const focusBehaviorMainAxis = Settings.getFocusBehaviorMainAxis();

        if (focusBehaviorMainAxis === FocusBehavior.CENTER) {
            return this.centerOnMainAxis(
                newSelectedColIndex,
                columns,
                workspace,
            );
        } else if (focusBehaviorMainAxis === FocusBehavior.LAZY_FOLLOW) {
            return this.lazyFollowOnMainAxis(
                newSelectedColIndex,
                columns,
                workspace,
            );
        }

        throw new Error(
            `Unknown focus behavior for main axis: ${focusBehaviorMainAxis}`,
        );
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private calculatePlacementOnCrossAxis(
        newSelectedCellIdx: number,
        cells: NonEmptyArray<Cell>,
        workspace: Rect,
    ) {
        const focusBehaviorCrossAxis = Settings.getFocusBehaviorCrossAxis();

        if (focusBehaviorCrossAxis === FocusBehavior.CENTER) {
            return this.centerOnCrossAxis(newSelectedCellIdx, cells, workspace);
        } else if (focusBehaviorCrossAxis === FocusBehavior.LAZY_FOLLOW) {
            return this.lazyFollowOnCrossAxis(
                newSelectedCellIdx,
                cells,
                workspace,
            );
        }

        throw new Error(
            `Unknown focus behavior for cross axis: ${focusBehaviorCrossAxis}`,
        );
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private centerOnMainAxis(
        newSelectedIndex: number,
        columns: NonEmptyArray<Column>,
        workspace: Rect,
    ) {
        const selectedCol = columns[newSelectedIndex];
        const resultCols = [
            new Column({
                selected: selectedCol.selected,
                cells: selectedCol.cells.map((cell) => {
                    return cell.clone({
                        rect: {
                            x: Math.floor(
                                workspace.width / 2 - cell.rect.width / 2,
                            ),
                        },
                    });
                }),
            }),
        ];

        return this.alignColumns(newSelectedIndex, columns, resultCols);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private centerOnCrossAxis(
        newSelectedIndex: number,
        cells: NonEmptyArray<Cell>,
        workspace: Rect,
    ) {
        const selectedCell = cells[newSelectedIndex];
        const resultCells = [
            selectedCell.clone({
                rect: {
                    y: Math.floor(
                        workspace.height / 2 - selectedCell.rect.height / 2,
                    ),
                },
            }),
        ];

        return this.alignCells(newSelectedIndex, cells, resultCells);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private lazyFollowOnMainAxis(
        newSelectedColumn: number,
        columns: NonEmptyArray<Column>,
        workspace: Rect,
    ) {
        const mrus = WorkspaceModelManager.getWindows();
        const visibleColumns = [columns[newSelectedColumn]];

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
                        .getSelectedCell()
                        .getSelectedWindow(),
                );
                const mruPositionOfRightNeighbor = mrus.indexOf(
                    maybeRightNeighborOfVisible
                        .getSelectedCell()
                        .getSelectedWindow(),
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

    @decorateFnWithLog("log", "WorkspaceModel")
    private centerAllColumnsOnMainAxis(
        columns: NonEmptyArray<Column>,
        workspace: Rect,
    ) {
        const totalWidth = this.calculateTotalWidth(columns);
        const [firstCol] = columns;
        const placedFirstCol = new Column({
            selected: firstCol.selected,
            cells: firstCol.cells.map((cell) => {
                return cell.clone({
                    rect: {
                        x: Math.floor(workspace.width / 2 - totalWidth / 2),
                    },
                });
            }),
        });

        return this.alignColumns(0, columns, [placedFirstCol]);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private alignToLeftMostColForLazyFollowOnMainAxis(
        leftMostFullyVisColumn: Column,
        columns: NonEmptyArray<Column>,
    ) {
        const leftMostIndex = columns.indexOf(leftMostFullyVisColumn);
        const windowsOffscreenOnLeft = leftMostIndex > 0;
        const peekingAmount =
            windowsOffscreenOnLeft ? Settings.getWindowPeeking() : 0;
        const placedCol = new Column({
            selected: leftMostFullyVisColumn.selected,
            cells: leftMostFullyVisColumn.cells.map((cell) => {
                return cell.clone({
                    rect: {
                        x:
                            leftMostFullyVisColumn.rect.width -
                            cell.rect.width +
                            peekingAmount,
                    },
                });
            }),
        });

        return this.alignColumns(leftMostIndex, columns, [placedCol]);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
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
            selected: rightMostFullyVisColumn.selected,
            cells: rightMostFullyVisColumn.cells.map((cell) => {
                return cell.clone({
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

    @decorateFnWithLog("log", "WorkspaceModel")
    private lazyFollowOnCrossAxis(
        newSelectedCellIdx: number,
        cells: NonEmptyArray<Cell>,
        workspace: Rect,
    ) {
        const mrus = WorkspaceModelManager.getWindows();
        const visibleCells = [cells[newSelectedCellIdx]];

        while (true) {
            const topMostVisibleCell = visibleCells[0];
            const bottomMostVisibleCell = visibleCells.at(-1) as Cell;
            const aboveIndex = cells.indexOf(topMostVisibleCell) - 1;
            const maybeAboveNeighborOfVisible = cells[aboveIndex];
            const belowIndex = cells.indexOf(bottomMostVisibleCell) + 1;
            const maybeBottomNeighborOfVisible = cells[belowIndex];

            if (
                maybeAboveNeighborOfVisible !== undefined &&
                maybeBottomNeighborOfVisible !== undefined
            ) {
                const mruPositionOfLeftNeighbor = mrus.indexOf(
                    maybeAboveNeighborOfVisible.getSelectedWindow(),
                );
                const mruPositionOfRightNeighbor = mrus.indexOf(
                    maybeBottomNeighborOfVisible.getSelectedWindow(),
                );

                if (mruPositionOfLeftNeighbor < mruPositionOfRightNeighbor) {
                    visibleCells.unshift(maybeAboveNeighborOfVisible);

                    if (
                        this.calculateTotalHeight(visibleCells) >
                        workspace.height
                    ) {
                        return this.alignToBottomMostCellForLazyFollowOnCrossAxis(
                            visibleCells.at(-1) as Cell,
                            cells,
                            workspace,
                        );
                    }
                } else {
                    visibleCells.push(maybeBottomNeighborOfVisible);

                    if (
                        this.calculateTotalHeight(visibleCells) >
                        workspace.height
                    ) {
                        return this.alignToTopMostCellForLazyFollowOnCrossAxis(
                            visibleCells[0],
                            cells,
                        );
                    }
                }
            } else if (maybeAboveNeighborOfVisible !== undefined) {
                visibleCells.unshift(maybeAboveNeighborOfVisible);

                if (
                    this.calculateTotalHeight(visibleCells) > workspace.height
                ) {
                    return this.alignToBottomMostCellForLazyFollowOnCrossAxis(
                        visibleCells.at(-1) as Cell,
                        cells,
                        workspace,
                    );
                }
            } else if (maybeBottomNeighborOfVisible !== undefined) {
                visibleCells.push(maybeBottomNeighborOfVisible);

                if (
                    this.calculateTotalHeight(visibleCells) > workspace.height
                ) {
                    return this.alignToTopMostCellForLazyFollowOnCrossAxis(
                        visibleCells[0],
                        cells,
                    );
                }
            } else {
                return this.centerAllCellsOnCrossAxis(cells, workspace);
            }
        }
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private alignToTopMostCellForLazyFollowOnCrossAxis(
        topMostCell: Cell,
        cells: NonEmptyArray<Cell>,
    ) {
        const topMostIndex = cells.indexOf(topMostCell);
        const placedCell = topMostCell.clone({ rect: { y: 0 } });

        return this.alignCells(topMostIndex, cells, [placedCell]);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private alignToBottomMostCellForLazyFollowOnCrossAxis(
        bottomMostCell: Cell,
        cells: NonEmptyArray<Cell>,
        workspace: Rect,
    ) {
        const bottomMostIndex = cells.indexOf(bottomMostCell);
        const placedCell = bottomMostCell.clone({
            rect: { y: workspace.height - bottomMostCell.rect.height },
        });

        return this.alignCells(bottomMostIndex, cells, [placedCell]);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private centerAllCellsOnCrossAxis(
        cells: NonEmptyArray<Cell>,
        workspace: Rect,
    ) {
        const totalHeight = this.calculateTotalHeight(cells);
        const [firstCell] = cells;
        const placedFirstCell = firstCell.clone({
            rect: { y: Math.floor(workspace.height / 2 - totalHeight / 2) },
        });

        return this.alignCells(0, cells, [placedFirstCell]);
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private insertWindowOnLeftOfFocus(
        window: Meta.Window,
        mrus: Meta.Window[],
        columns: NonEmptyArray<Column>,
        selected: number,
        workspace: Rect,
    ) {
        const windowFrame = window.get_frame_rect();
        const [prevFocusedWindow] = mrus;
        const prevCol =
            prevFocusedWindow &&
            columns.find((col) => col.contains(prevFocusedWindow));
        const newColumn = new Column({
            selected: 0,
            cells: [
                new Cell({
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
            ...columns.slice(0, selected),
            newColumn,
            ...columns.slice(selected),
        ];
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private insertWindowOnRightOfFocus(
        window: Meta.Window,
        mrus: Meta.Window[],
        columns: NonEmptyArray<Column>,
        selected: number,
        workspace: Rect,
    ) {
        const windowFrame = window.get_frame_rect();
        const [prevFocusedWindow] = mrus;
        const prevCol =
            prevFocusedWindow &&
            columns.find((col) => col.contains(prevFocusedWindow));
        const newColumn = new Column({
            selected: 0,
            cells: [
                new Cell({
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
            ...columns.slice(0, selected + 1),
            newColumn,
            ...columns.slice(selected + 1),
        ];
    }

    @decorateFnWithLog("log", "WorkspaceModel")
    private insertWindowBetweenMrus(
        window: Meta.Window,
        mrus: Meta.Window[],
        columns: NonEmptyArray<Column>,
        selected: number,
        workspace: Rect,
    ) {
        const [prevFocusedWindow, prevPrevFocusedWindow] = mrus;

        if (prevPrevFocusedWindow === undefined) {
            return this.insertWindowOnLeftOfFocus(
                window,
                mrus,
                columns,
                selected,
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
                selected,
                workspace,
            );
        } else {
            return this.insertWindowOnRightOfFocus(
                window,
                mrus,
                columns,
                selected,
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
        Cell,
        WindowOpeningPosition,
    };
}

export {
    TestEnv,
    WorkspaceModel,
    ModelChangeErrors as WorkspaceModelChangeErrors,
};
