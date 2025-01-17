import { Debug } from "../utils/debug.js";
import { Settings } from "../utils/settings.js";

/** @typedef {{x: number, y: number, width: number, height: number}} Rect */
/** @typedef {Item} Item */
/** @typedef {Column} Column */
/** @typedef {WorkspaceGrid} WorkspaceGrid */
/** @typedef {WorkspaceModelChangeResult} WorkspaceModelChangeResult */

const FocusBehavior = Object.freeze({
    CENTER: 0,
    LAZY_FOLLOW: 1,
});

const WindowOpeningPosition = Object.freeze({
    LEFT: 0,
    RIGHT: 1,
    BETWEEN_MRU: 2,
});

class Item {
    /** @type {Meta.Window} */
    #value;

    /** @type {Rect} */
    #rect;

    /**
     * @param {object} param
     * @param {Meta.Window} param.value
     * @param {Rect} param.rect
     */
    constructor({
        value,
        rect = {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        },
    } = {}) {
        Debug.assert(
            value !== undefined,
            "Value must be defined (eg a Window).",
        );

        this.#value = value;
        this.#rect = rect;
    }

    get value() {
        return this.#value;
    }

    get rect() {
        return this.#rect;
    }

    destroy() {
        this.#value = null;
        this.#rect = null;
    }

    /**
     * @param {object} [param]
     * @param {Meta.Window} [param.value]
     * @param {Rect} [param.rect]
     *
     * @returns {Item}
     */
    clone({ value = this.#value, rect = this.#rect } = {}) {
        return new Item({ value, rect: { ...this.#rect, ...rect } });
    }

    /**
     * @param {*} v
     *
     * @returns {boolean}
     */
    contains(v) {
        return v === this.#value;
    }

    /**
     * @param {Item} otherItem
     *
     * @returns {boolean}
     */
    equals(otherItem) {
        return this.#value === otherItem.value;
    }

    /** @returns {Meta.Window} */
    getFocusedWindow() {
        return this.#value;
    }

    sync() {
        const workArea = this.#value.get_work_area_current_monitor();
        const windowActor = this.#value.get_compositor_private();

        // Windows cant be moved offscreen entirely: https://gitlab.gnome.org/GNOME/mutter/-/blob/main/src/core/constraints.c.
        // So just hide the actor if the window is meant to be offscreen but
        // constrained to be onscreen by mutter.
        const offScreenLimit = 75;
        const isOffScreen =
            this.#rect.x + this.#rect.width <= offScreenLimit ||
            this.#rect.x >= workArea.x + workArea.width - offScreenLimit;

        if (isOffScreen) {
            windowActor.hide();
        } else {
            windowActor.show();
            this.#value.move_resize_frame(
                true,
                workArea.x + this.#rect.x,
                workArea.y + this.#rect.y,
                this.#rect.width,
                this.#rect.height,
            );
        }
    }
}

class Column {
    /** @type {number} */
    #focusedItem;

    /** @type {Item[]} */
    #items;

    /** @type {Rect} */
    #rect;

    get focusedItem() {
        return this.#focusedItem;
    }

    get items() {
        return this.#items;
    }

    get rect() {
        return this.#rect;
    }

    /**
     * @param {object} param
     * @param {Item[]} param.items
     * @param {number} param.focusedItem
     */
    constructor({ items = [], focusedItem = 0 } = {}) {
        Debug.assert(
            Array.isArray(items) && items.length > 0,
            `Columns must have at least one item: ${items}`,
        );

        Debug.assert(
            Number.isInteger(focusedItem) &&
                focusedItem >= 0 &&
                focusedItem < items.length,
            `focus must be a valid index: ${focusedItem}`,
        );

        this.#focusedItem = focusedItem;
        this.#items = items;
        this.#rect = items.reduce(
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
        this.#focusedItem = null;
        this.#items.forEach((item) => item.destroy());
        this.#items = null;
        this.#rect = null;
    }

    /**
     * @param {object} [param]
     * @param {Item[]} [param.items]
     * @param {number} [param.focusedItem]
     *
     * @returns {Column}
     */
    clone({ items = this.#items, focusedItem = this.#focusedItem } = {}) {
        return new Column({ items, focusedItem });
    }

    /**
     * @param {*} v
     *
     * @returns {boolean}
     */
    contains(v) {
        return this.#items.some((item) => item.contains(v));
    }

    /**
     * @param {Column} otherCol
     *
     * @returns {boolean}
     */
    equals(otherCol) {
        return (
            this.#items.length === otherCol.items.length &&
            this.#items.every((item, i) => item.equals(otherCol.items[i]))
        );
    }

    /** @returns {Item} */
    getFocusedItem() {
        return this.#items[this.#focusedItem];
    }

    /**
     * @param {object} [param]
     * @param {number} [param.dx]
     * @param {number} [param.dy]
     *
     * @returns {Column}
     */
    shift({ dx = 0, dy = 0 } = {}) {
        return new Column({
            focusedItem: this.#focusedItem,
            items: this.#items.map((item) => {
                return item.clone({
                    rect: { x: item.rect.x + dx, y: item.rect.y + dy },
                });
            }),
        });
    }
}

class WorkspaceModelChangeResult {
    /** @type {boolean} */
    #ok;

    /** @type {WorkspaceModel|undefined} */
    #model;

    constructor({ ok, model = undefined } = {}) {
        this.#ok = ok;
        this.#model = model;
    }

    get ok() {
        return this.#ok;
    }

    get model() {
        return this.#model;
    }
}

class WorkspaceGrid {
    /** @type {Item[][]} */
    #items;

    /** @type {Rect} */
    #workArea;

    get items() {
        return this.#items;
    }

    get workArea() {
        return this.#workArea;
    }

    /**
     * @param {object} param
     * @param {Item[][]} param.items
     * @param {Rect} param.workArea
     */
    constructor({
        items = [],
        workArea = {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        },
    } = {}) {
        this.#items = items;
        this.#workArea = workArea;
    }
}

class WorkspaceModel {
    /** @type {Column[]} */
    #columns;

    /** @type {number|undefined} */
    #focusedColumn;

    /** @type {Rect} */
    #workArea;

    /** @type {WorkspaceModelManager} */
    #workspaceModelManager;

    get columns() {
        return this.#columns;
    }

    get focusedColumn() {
        return this.#focusedColumn;
    }

    get workArea() {
        return this.#workArea;
    }

    get workspaceModelManager() {
        return this.#workspaceModelManager;
    }

    /**
     * @param {object} param
     * @param {WorkspaceModelManager} param.workspaceModelManager
     * @param {Column[]} param.columns
     * @param {number|undefined} param.focusedColumn
     * @param {Rect} param.workArea
     */
    constructor({
        workspaceModelManager,
        columns = [],
        focusedColumn,
        workArea = {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        },
    } = {}) {
        Debug.assert(
            Array.isArray(columns),
            `columns must be an array of columns: ${columns}`,
        );

        Debug.assert(
            focusedColumn === undefined ||
                (Number.isInteger(focusedColumn) &&
                    focusedColumn >= 0 &&
                    focusedColumn < columns.length),
            `focus must be a valid index: ${focusedColumn}`,
        );

        this.#workspaceModelManager = workspaceModelManager;
        this.#columns = columns;
        this.#focusedColumn = focusedColumn;
        this.#workArea = workArea;
    }

    destroy() {
        this.#columns.forEach((col) => col.destroy());
    }

    clone({
        focusedColumn = this.#focusedColumn,
        columns = this.#columns,
        workArea = this.#workArea,
    } = {}) {
        return new WorkspaceModel({
            workspaceModelManager: this.#workspaceModelManager,
            columns,
            focusedColumn,
            workArea,
        });
    }

    /** @returns {WorkspaceGrid} */
    getGrid() {
        return new WorkspaceGrid({
            workArea: this.#workArea,
            items: this.#columns.map((col) => {
                return col.items.map((item) => item.clone());
            }),
        });
    }

    /**
     * @param {Meta.Window|null|undefined} window - the window to focus on
     *
     * @returns {WorkspaceModelChangeResult}
     */
    relayout(window) {
        if (window === null || window === undefined) {
            Debug.assert(
                this.#columns.length === 0,
                "Workspace isn't empty. Missing window to focus on.",
            );

            return new WorkspaceModelChangeResult({
                ok: true,
                model: new WorkspaceModel({
                    workArea: this.#workArea,
                    workspaceModelManager: this.#workspaceModelManager,
                }),
            });
        }

        const { focusedColumn: newFocusedColumn, focusedItem: newFocusItem } =
            this.#findFocusedIndices(window);

        Debug.assert(
            newFocusedColumn !== undefined && newFocusItem !== undefined,
            `Window not found in workspace: ${window}`,
        );

        const mrus = this.#workspaceModelManager.getWindows();
        const placedCols = calculatePlacementOnMainAxis(
            newFocusedColumn,
            this.#columns,
            mrus,
            this.#workArea,
        );
        const placedFocusedCol = placedCols[newFocusedColumn];
        const placedItems = calculatePlacementOnCrossAxis(
            newFocusItem,
            placedFocusedCol.items,
            mrus,
            this.#workArea,
        );

        return new WorkspaceModelChangeResult({
            ok: true,
            model: new WorkspaceModel({
                workspaceModelManager: this.#workspaceModelManager,
                columns: placedCols.with(
                    newFocusedColumn,
                    new Column({
                        items: placedItems,
                        focusedItem: newFocusItem,
                    }),
                ),
                focusedColumn: newFocusedColumn,
                workArea: this.#workArea,
            }),
        });
    }

    /** @returns {Meta.Window|undefined} */
    getItemOnLeftOfFocus() {
        if (this.#focusedColumn === undefined || this.#focusedColumn === 0) {
            return undefined;
        }

        const newCol = this.#columns[this.#focusedColumn - 1];

        return newCol.getFocusedItem().value;
    }

    /** @returns {Meta.Window|undefined} */
    getItemOnRightOfFocus() {
        if (
            this.#focusedColumn === undefined ||
            this.#focusedColumn === this.#columns.length - 1
        ) {
            return undefined;
        }

        const newCol = this.#columns[this.#focusedColumn + 1];

        return newCol.getFocusedItem().value;
    }

    /** @returns {Meta.Window|undefined} */
    getItemAboveFocus() {
        if (this.#focusedColumn === undefined) {
            return undefined;
        }

        const currColumn = this.#getFocusedColumn();

        if (currColumn.focusedItem === 0) {
            return undefined;
        }

        return currColumn.items[currColumn.focusedItem - 1].value;
    }

    /** @returns {Meta.Window|undefined} */
    getItemBelowFocus() {
        if (this.#focusedColumn === undefined) {
            return undefined;
        }

        const currColumn = this.#getFocusedColumn();

        if (currColumn.focusedItem >= currColumn.items.length - 1) {
            return undefined;
        }

        return currColumn.items[currColumn.focusedItem + 1].value;
    }

    /** @returns {WorkspaceModelChangeResult} */
    moveFocusedColumnUp() {
        // TODO multi-workspace movement
    }

    /** @returns {WorkspaceModelChangeResult} */
    moveFocusedColumnDown() {
        // TODO multi-workspace movement
    }

    /** @returns {WorkspaceModelChangeResult} */
    moveFocusedColumnLeft() {
        if (this.#focusedColumn === undefined || this.#focusedColumn === 0) {
            return new WorkspaceModelChangeResult({ ok: false });
        }

        const col = this.#getFocusedColumn();
        const window = col.items[col.focusedItem].value;
        const model = new WorkspaceModel({
            workspaceModelManager: this.#workspaceModelManager,
            workArea: this.#workArea,
            columns: [
                ...this.#columns.slice(0, this.#focusedColumn - 1),
                this.#columns[this.#focusedColumn],
                this.#columns[this.#focusedColumn - 1],
                ...this.#columns.slice(this.#focusedColumn + 1),
            ],
        });

        return model.relayout(window);
    }

    /** @returns {WorkspaceModelChangeResult} */
    moveFocusedColumnRight() {
        if (
            this.#focusedColumn === undefined ||
            this.#focusedColumn >= this.#columns.length - 1
        ) {
            return new WorkspaceModelChangeResult({ ok: false });
        }

        const col = this.#getFocusedColumn();
        const window = col.items[col.focusedItem].value;
        const model = new WorkspaceModel({
            workspaceModelManager: this.#workspaceModelManager,
            workArea: this.#workArea,
            columns: [
                ...this.#columns.slice(0, this.#focusedColumn),
                this.#columns[this.#focusedColumn + 1],
                this.#columns[this.#focusedColumn],
                ...this.#columns.slice(this.#focusedColumn + 2),
            ],
        });

        return model.relayout(window);
    }

    /** @returns {WorkspaceModelChangeResult} */
    moveFocusedItemUp() {
        if (this.#focusedColumn === undefined) {
            return new WorkspaceModelChangeResult({ ok: false });
        }

        const currColumn = this.#getFocusedColumn();

        if (currColumn.focusedItem === 0) {
            return new WorkspaceModelChangeResult({ ok: false });
        }

        const model = new WorkspaceModel({
            workspaceModelManager: this.#workspaceModelManager,
            workArea: this.#workArea,
            focusedColumn: this.#focusedColumn,
            columns: this.#columns.with(
                this.#focusedColumn,
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

    /** @returns {WorkspaceModelChangeResult} */
    moveFocusedItemDown() {
        if (this.#focusedColumn === undefined) {
            return new WorkspaceModelChangeResult({ ok: false });
        }

        const currColumn = this.#getFocusedColumn();

        if (currColumn.focusedItem >= currColumn.items.length - 1) {
            return new WorkspaceModelChangeResult({ ok: false });
        }

        const model = new WorkspaceModel({
            workspaceModelManager: this.#workspaceModelManager,
            workArea: this.#workArea,
            focusedColumn: this.#focusedColumn,
            columns: this.#columns.with(
                this.#focusedColumn,
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

    /** @returns {WorkspaceModelChangeResult} */
    moveFocusedItemLeft() {
        if (
            this.#focusedColumn === undefined ||
            (this.#focusedColumn === 0 &&
                this.#getFocusedColumn().items.length === 1)
        ) {
            return new WorkspaceModelChangeResult({ ok: false });
        }

        const fromColumn = this.#getFocusedColumn();
        const maybeToColumn = this.#columns[this.#focusedColumn - 1];
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
        const newFocusedColumn = Math.max(0, this.#focusedColumn - 1);
        const fromColumnWasEmptied = fromColumn.items.length === 1;
        const newColumns =
            fromColumnWasEmptied ?
                [
                    ...this.#columns.slice(0, newFocusedColumn),
                    toColumn,
                    ...this.#columns.slice(this.#focusedColumn + 1),
                ]
            :   [
                    ...this.#columns.slice(0, newFocusedColumn),
                    toColumn,
                    new Column({
                        focusedItem: focusedItemInNewFromColumn,
                        items: calculatePlacementOnCrossAxis(
                            focusedItemInNewFromColumn,
                            fromColumn.items.toSpliced(
                                fromColumn.focusedItem,
                                1,
                            ),
                            this.#workspaceModelManager.getWindows(),
                            this.#workArea,
                        ),
                    }),
                    ...this.#columns.slice(this.#focusedColumn + 1),
                ];

        return new WorkspaceModel({
            columns: newColumns,
            workspaceModelManager: this.#workspaceModelManager,
            focusedColumn: newFocusedColumn,
            workArea: this.#workArea,
        }).relayout(window);
    }

    /** @returns {WorkspaceModelChangeResult} */
    moveFocusedItemRight() {
        if (
            this.#focusedColumn === undefined ||
            (this.#focusedColumn === this.#columns.length - 1 &&
                this.#getFocusedColumn().items.length === 1)
        ) {
            return new WorkspaceModelChangeResult({ ok: false });
        }

        const fromColumn = this.#getFocusedColumn();
        const maybeToColumn = this.#columns[this.#focusedColumn + 1];
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
                    ...this.#columns.slice(0, this.#focusedColumn),
                    toColumn,
                    ...this.#columns.slice(this.#focusedColumn + 2),
                ]
            :   [
                    ...this.#columns.slice(0, this.#focusedColumn),
                    new Column({
                        focusedItem: focusedItemInNewFromColumn,
                        items: calculatePlacementOnCrossAxis(
                            focusedItemInNewFromColumn,
                            fromColumn.items.toSpliced(
                                fromColumn.focusedItem,
                                1,
                            ),
                            this.#workspaceModelManager.getWindows(),
                            this.#workArea,
                        ),
                    }),
                    toColumn,
                    ...this.#columns.slice(this.#focusedColumn + 2),
                ];

        const addedANewColumn = newColumns.length > this.#columns.length;

        return new WorkspaceModel({
            columns: newColumns,
            workspaceModelManager: this.#workspaceModelManager,
            workArea: this.#workArea,
            focusedColumn: this.#focusedColumn + (addedANewColumn ? 1 : 0),
        }).relayout(window);
    }

    /**
     * @param {Meta.Window} window
     *
     * @returns {WorkspaceModelChangeResult}
     */
    insertWindow(window) {
        Debug.assert(
            this.#columns.every(
                (col) => col.items.every((item) => item.value !== window),
                `Window (${window}) already in workspace`,
            ),
        );

        let cols;
        const openingPosition = Settings.getWindowOpeningPosition();
        const mrus = this.#workspaceModelManager
            .getWindows()
            .filter((w) => w !== window);

        if (openingPosition === WindowOpeningPosition.LEFT) {
            cols = insertWindowOnLeftOfFocus(
                window,
                mrus,
                this.#columns,
                this.#focusedColumn,
                this.#workArea,
            );
        } else if (openingPosition === WindowOpeningPosition.RIGHT) {
            cols = insertWindowOnRightOfFocus(
                window,
                mrus,
                this.#columns,
                this.#focusedColumn,
                this.#workArea,
            );
        } else if (openingPosition === WindowOpeningPosition.BETWEEN_MRU) {
            cols = insertWindowBetweenMrus(
                window,
                mrus,
                this.#columns,
                this.#focusedColumn,
                this.#workArea,
            );
        } else {
            throw new Error(
                `Unknown window opening position: ${openingPosition}`,
            );
        }

        return new WorkspaceModel({
            workspaceModelManager: this.#workspaceModelManager,
            workArea: this.#workArea,
            columns: cols,
        }).relayout(window);
    }

    /**
     * @param {Meta.Window} window - window in the workspace model to remove
     * @param {Meta.Window|undefined} newFocus - window to focus on after removal
     *
     * @returns {WorkspaceModelChangeResult}
     */
    removeWindow(window, newFocus) {
        const noNewFocus = newFocus === undefined || newFocus === null;

        Debug.assert(
            newFocus || (noNewFocus && this.#columns.length === 1),
            "Missing window to focus on after removal",
        );

        const column = this.#columns.find((column) => column.contains(window));

        Debug.assert(
            column !== undefined,
            `Window not found in workspace: ${window}`,
        );

        if (column.items.length === 1) {
            return new WorkspaceModel({
                workspaceModelManager: this.#workspaceModelManager,
                workArea: this.#workArea,
                columns: this.#columns.filter((col) => col !== column),
            }).relayout(newFocus);
        }

        const index = column.items.findIndex((item) => item.value === window);
        const items = column.items.toSpliced(index, 1);
        const focusedItem = Math.min(column.focusedItem, items.length - 1);
        const newColumn = new Column({
            focusedItem: focusedItem,
            items: calculatePlacementOnCrossAxis(
                focusedItem,
                items,
                this.#workspaceModelManager.getWindows(),
                this.#workArea,
            ),
        });

        return new WorkspaceModel({
            workspaceModelManager: this.#workspaceModelManager,
            workArea: this.#workArea,
            columns: this.#columns.with(
                this.#columns.indexOf(column),
                newColumn,
            ),
        }).relayout(newFocus);
    }

    /**
     * @param {Meta.Window} window
     *
     * @returns {{newFocusedColumn: number|undefined, newFocusedItem: number|undefined}}
     */
    #findFocusedIndices(window) {
        const indices = { focusedColumn: undefined, focusedItem: undefined };

        for (let colIndex = 0; colIndex < this.#columns.length; colIndex++) {
            const column = this.#columns[colIndex];
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

    /** @returns {Column} */
    #getFocusedColumn() {
        return this.#columns[this.#focusedColumn];
    }
}

/**
 * @param {Column[]} columns
 *
 * @returns {number}
 */
function calculateTotalWidth(columns) {
    return columns.reduce((acc, col) => acc + col.rect.width, 0);
}

/**
 * @param {Item[]} items
 *
 * @returns {number}
 */
function calculateTotalHeight(items) {
    return items.reduce((acc, item) => acc + item.rect.height, 0);
}

/**
 * @param {number} index
 * @param {Column[]} columns
 * @param {Column[]} resultCols
 *
 * @returns {Column[]}
 */
function alignColumns(index, columns, resultCols) {
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
        const prevCol = resultCols.at(-1);

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

/**
 * @param {number} newFocusIndex
 * @param {Item[]} items
 * @param {Item[]} resultItems
 *
 * @returns {Item[]}
 */
function alignItems(newFocusIndex, items, resultItems) {
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
        const prevItem = resultItems.at(-1);

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

/**
 * @param {number} newFocusColumn
 * @param {Meta.Window[]} mrus
 * @param {Column[]} columns
 * @param {Rect} workspace
 *
 * @returns {Column[]}
 */
function calculatePlacementOnMainAxis(
    newFocusColumn,
    columns,
    mrus,
    workspace,
) {
    const focusBehaviorMainAxis = Settings.getFocusBehaviorMainAxis();

    if (focusBehaviorMainAxis === FocusBehavior.CENTER) {
        return centerOnMainAxis(newFocusColumn, columns, workspace);
    } else if (focusBehaviorMainAxis === FocusBehavior.LAZY_FOLLOW) {
        return lazyFollowOnMainAxis(newFocusColumn, columns, mrus, workspace);
    }

    throw new Error(
        `Unknown focus behavior for main axis: ${focusBehaviorMainAxis}`,
    );
}

/**
 * @param {number} newFocusItem
 * @param {Item[]} items
 * @param {Meta.Window[]} mrus
 * @param {Rect} workspace
 *
 * @returns {Item[]}
 */
function calculatePlacementOnCrossAxis(newFocusItem, items, mrus, workspace) {
    const focusBehaviorCrossAxis = Settings.getFocusBehaviorCrossAxis();

    if (focusBehaviorCrossAxis === FocusBehavior.CENTER) {
        return centerOnCrossAxis(newFocusItem, items, workspace);
    } else if (focusBehaviorCrossAxis === FocusBehavior.LAZY_FOLLOW) {
        return lazyFollowOnCrossAxis(newFocusItem, items, mrus, workspace);
    }

    throw new Error(
        `Unknown focus behavior for cross axis: ${focusBehaviorCrossAxis}`,
    );
}

/**
 * @param {number} newFocusIndex
 * @param {Column[]} columns
 * @param {Rect} workspace
 *
 * @returns {Column[]}
 */
function centerOnMainAxis(newFocusIndex, columns, workspace) {
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

    return alignColumns(newFocusIndex, columns, resultCols);
}

/**
 * @param {number} newFocusIndex
 * @param {Item[]} items
 * @param {Rect} workspace
 *
 * @returns {Item[]}
 */
function centerOnCrossAxis(newFocusIndex, items, workspace) {
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

    return alignItems(newFocusIndex, items, resultItems);
}

/**
 * @param {number} newFocusColumn
 * @param {Column[]} columns
 * @param {Meta.Window[]} mrus
 * @param {Rect} workspace
 *
 * @returns {Column[]}
 */
function lazyFollowOnMainAxis(newFocusColumn, columns, mrus, workspace) {
    const visibleColumns = [columns[newFocusColumn]];

    while (true) {
        const leftMostVisibleCol = visibleColumns[0];
        const rightMostVisibleCol = visibleColumns.at(-1);
        const leftNeighborIndex = columns.indexOf(leftMostVisibleCol) - 1;
        const rightNeighborIndex = columns.indexOf(rightMostVisibleCol) + 1;
        const maybeLeftNeighborOfVisible = columns[leftNeighborIndex];
        const maybeRightNeighborOfVisible = columns[rightNeighborIndex];

        if (
            maybeLeftNeighborOfVisible !== undefined &&
            maybeRightNeighborOfVisible !== undefined
        ) {
            const mruPositionOfLeftNeighbor = mrus.indexOf(
                maybeLeftNeighborOfVisible.getFocusedItem().getFocusedWindow(),
            );
            const mruPositionOfRightNeighbor = mrus.indexOf(
                maybeRightNeighborOfVisible.getFocusedItem().getFocusedWindow(),
            );

            if (mruPositionOfLeftNeighbor < mruPositionOfRightNeighbor) {
                visibleColumns.unshift(maybeLeftNeighborOfVisible);

                if (calculateTotalWidth(visibleColumns) > workspace.width) {
                    return alignToRightMostColForLazyFollowOnMainAxis(
                        visibleColumns.at(-1),
                        columns,
                        workspace,
                    );
                }
            } else {
                visibleColumns.push(maybeRightNeighborOfVisible);

                if (calculateTotalWidth(visibleColumns) > workspace.width) {
                    return alignToLeftMostColForLazyFollowOnMainAxis(
                        visibleColumns[0],
                        columns,
                    );
                }
            }
        } else if (maybeLeftNeighborOfVisible !== undefined) {
            visibleColumns.unshift(maybeLeftNeighborOfVisible);

            if (calculateTotalWidth(visibleColumns) > workspace.width) {
                return alignToRightMostColForLazyFollowOnMainAxis(
                    visibleColumns.at(-1),
                    columns,
                    workspace,
                );
            }
        } else if (maybeRightNeighborOfVisible !== undefined) {
            visibleColumns.push(maybeRightNeighborOfVisible);

            if (calculateTotalWidth(visibleColumns) > workspace.width) {
                return alignToLeftMostColForLazyFollowOnMainAxis(
                    visibleColumns[0],
                    columns,
                );
            }
        } else {
            return centerAllColumnsOnMainAxis(columns, workspace);
        }
    }
}

/**
 * @param {Column[]} columns
 * @param {Rect} workspace
 *
 * @returns {Column[]}
 */
function centerAllColumnsOnMainAxis(columns, workspace) {
    const totalWidth = calculateTotalWidth(columns);
    const [firstCol] = columns;
    const placedFirstCol = new Column({
        focusedItem: firstCol.focusedItem,
        items: firstCol.items.map((item) => {
            return item.clone({
                rect: { x: Math.floor(workspace.width / 2 - totalWidth / 2) },
            });
        }),
    });

    return alignColumns(0, columns, [placedFirstCol]);
}

/**
 * @param {Column} leftMostColumn - the left most column in the columns array
 * @param {Column[]} columns
 *
 * @returns {Column[]}
 */
function alignToLeftMostColForLazyFollowOnMainAxis(leftMostColumn, columns) {
    const leftMostIndex = columns.indexOf(leftMostColumn);
    const placedCol = new Column({
        focusedItem: leftMostColumn.focusedItem,
        items: leftMostColumn.items.map((item) => {
            return item.clone({
                rect: { x: leftMostColumn.rect.width - item.rect.width },
            });
        }),
    });

    return alignColumns(leftMostIndex, columns, [placedCol]);
}

/**
 * @param {Column} rightMostColumn - the right most column in the columns array
 * @param {Column[]} columns
 * @param {Rect} workspace
 *
 * @returns {Column[]}
 */
function alignToRightMostColForLazyFollowOnMainAxis(
    rightMostColumn,
    columns,
    workspace,
) {
    const rightMostIndex = columns.indexOf(rightMostColumn);
    const placedCol = new Column({
        focusedItem: rightMostColumn.focusedItem,
        items: rightMostColumn.items.map((item) => {
            return item.clone({
                rect: { x: workspace.width - rightMostColumn.rect.width },
            });
        }),
    });

    return alignColumns(rightMostIndex, columns, [placedCol]);
}

/**
 * @param {number} newFocusItem
 * @param {Item[]} items
 * @param {Meta.Window[]} mrus
 * @param {Rect} workspace
 *
 * @returns {Item[]}
 */
function lazyFollowOnCrossAxis(newFocusItem, items, mrus, workspace) {
    const visibleItems = [items[newFocusItem]];

    while (true) {
        const topMostVisibleItem = visibleItems[0];
        const bottomMostVisibleItem = visibleItems.at(-1);
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

                if (calculateTotalHeight(visibleItems) > workspace.height) {
                    return alignToBottomMostItemForLazyFollowOnCrossAxis(
                        visibleItems.at(-1),
                        items,
                        workspace,
                    );
                }
            } else {
                visibleItems.push(maybeBottomNeighborOfVisible);

                if (calculateTotalHeight(visibleItems) > workspace.height) {
                    return alignToTopMostItemForLazyFollowOnCrossAxis(
                        visibleItems[0],
                        items,
                    );
                }
            }
        } else if (maybeAboveNeighborOfVisible !== undefined) {
            visibleItems.unshift(maybeAboveNeighborOfVisible);

            if (calculateTotalHeight(visibleItems) > workspace.height) {
                return alignToBottomMostItemForLazyFollowOnCrossAxis(
                    visibleItems.at(-1),
                    items,
                    workspace,
                );
            }
        } else if (maybeBottomNeighborOfVisible !== undefined) {
            visibleItems.push(maybeBottomNeighborOfVisible);

            if (calculateTotalHeight(visibleItems) > workspace.height) {
                return alignToTopMostItemForLazyFollowOnCrossAxis(
                    visibleItems[0],
                    items,
                );
            }
        } else {
            return centerAllItemsOnCrossAxis(items, workspace);
        }
    }
}

/**
 * @param {Item} topMostItem - the top most item in the items array
 * @param {Item[]} items
 *
 * @returns {Item[]}
 */
function alignToTopMostItemForLazyFollowOnCrossAxis(topMostItem, items) {
    const topMostIndex = items.indexOf(topMostItem);
    const placedItem = topMostItem.clone({ rect: { y: 0 } });

    return alignItems(topMostIndex, items, [placedItem]);
}

/**
 * @param {Item} bottomMostItem - the bottom most item in the items array
 * @param {Item[]} items
 * @param {Rect} workspace
 *
 * @returns {Item[]}
 */
function alignToBottomMostItemForLazyFollowOnCrossAxis(
    bottomMostItem,
    items,
    workspace,
) {
    const bottomMostIndex = items.indexOf(bottomMostItem);
    const placedItem = bottomMostItem.clone({
        rect: { y: workspace.height - bottomMostItem.rect.height },
    });

    return alignItems(bottomMostIndex, items, [placedItem]);
}

/**
 * @param {Item[]} items
 * @param {Rect} workspace
 *
 * @returns {Item[]}
 */
function centerAllItemsOnCrossAxis(items, workspace) {
    const totalHeight = totalHeight(items);
    const [firstItem] = items;
    const placedFirstItem = firstItem.clone({
        rect: { y: Math.floor(workspace.height / 2 - totalHeight / 2) },
    });

    return alignItems(0, items, [placedFirstItem]);
}

/**
 * @param {Meta.Window} window
 * @param {Meta.Window[]} mrus
 * @param {Column[]} columns
 * @param {number} focusedColumn
 * @param {Rect} workspace
 *
 * @returns {Column[]}
 */
function insertWindowOnLeftOfFocus(
    window,
    mrus,
    columns,
    focusedColumn,
    workspace,
) {
    const windowFrame = window.get_frame_rect();
    const [prevFocusedWindow] = mrus;
    const newColumn = new Column({
        focusedItem: 0,
        items: [
            new Item({
                value: window,
                rect: {
                    x:
                        prevFocusedWindow ?
                            prevFocusedWindow.get_frame_rect().x -
                            windowFrame.width
                        :   0,
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

/**
 * @param {Meta.Window} window
 * @param {Meta.Window[]} mrus
 * @param {Column[]} columns
 * @param {number} focusedColumn
 * @param {Rect} workspace
 *
 * @returns {Column[]}
 */
function insertWindowOnRightOfFocus(
    window,
    mrus,
    columns,
    focusedColumn,
    workspace,
) {
    const windowFrame = window.get_frame_rect();
    const [prevFocusedWindow] = mrus;
    const newColumn = new Column({
        focusedItem: 0,
        items: [
            new Item({
                value: window,
                rect: {
                    x:
                        prevFocusedWindow ?
                            prevFocusedWindow.get_frame_rect().x +
                            windowFrame.width
                        :   0,
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

/**
 * @param {Meta.Window} window
 * @param {Meta.Window[]} mrus
 * @param {Column[]} columns
 * @param {number} focusedColumn
 * @param {Rect} workspace
 *
 * @returns {Column[]}
 */
function insertWindowBetweenMrus(
    window,
    mrus,
    columns,
    focusedColumn,
    workspace,
) {
    const [prevFocusedWindow, prevPrevFocusedWindow] = mrus;

    if (
        prevFocusedWindow === undefined ||
        prevPrevFocusedWindow === undefined
    ) {
        return insertWindowOnLeftOfFocus(
            window,
            mrus,
            columns,
            focusedColumn,
            workspace,
        );
    }

    const direction =
        prevFocusedWindow.get_frame_rect().x -
        prevPrevFocusedWindow.get_frame_rect().x;

    if (direction > 0) {
        return insertWindowOnLeftOfFocus(
            window,
            mrus,
            columns,
            focusedColumn,
            workspace,
        );
    } else {
        return insertWindowOnRightOfFocus(
            window,
            mrus,
            columns,
            focusedColumn,
            workspace,
        );
    }
}

let TestEnv;

if (process.env.NODE_ENV === "test") {
    TestEnv = {
        Column,
        Item,
        WindowOpeningPosition,
    };
}

export { TestEnv, WorkspaceModel };
