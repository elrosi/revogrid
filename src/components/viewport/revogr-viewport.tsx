import {Component, Prop, h, Host, Watch, Listen, Element, Event, EventEmitter} from '@stencil/core';
import {ObservableMap} from '@stencil/store';
import '../../utils/closestPolifill';

import {UUID} from '../../utils/consts';
import GridScrollingService, {ElementScroll} from './gridScrollingService';
import CellSelectionService from '../overlay/selection/cellSelectionService';
import ViewportSpace from './viewport.interfaces';
import {DataProvider} from '../../services/data.provider';
import {DataSourceState} from '../../store/dataSource/data.store';
import SelectionStoreConnector from '../../services/selection.store.connector';
import {Edition, RevoGrid, Selection} from '../../interfaces';
import ViewportProps = ViewportSpace.ViewportProps;
import ViewportData = ViewportSpace.ViewportData;
import SlotType = ViewportSpace.SlotType;
import Properties = ViewportSpace.Properties;


/**
 * Renders viewport
 * @Component
 * @Prop uuid - grid id
 * @Prop resize - can resize grid
 * @Prop readonly - can edit grid
 * @Prop range - can change range
 * */

@Component({
    tag: 'revogr-viewport'
})
export class RevogrViewport {
    private elementToScroll: ElementScroll[] = [];
    private scrollingService: GridScrollingService;
    private selectionStoreConnector: SelectionStoreConnector;

    @Event() setDimensionSize: EventEmitter<{type: RevoGrid.MultiDimensionType, sizes: RevoGrid.ViewSettingSizeProp}>;
    @Event() setViewportCoordinate: EventEmitter<RevoGrid.ViewPortScrollEvent>;
    @Event() setViewportSize: EventEmitter<RevoGrid.ViewPortResizeEvent>;

    @Element() element: Element;
    @Prop() columnStores: {[T in RevoGrid.DimensionCols]: ObservableMap<DataSourceState<RevoGrid.ColumnDataSchemaRegular>>};
    @Prop() rowStores: {[T in RevoGrid.DimensionRows]: ObservableMap<DataSourceState<RevoGrid.DataType>>};
    @Prop() dimensions: {[T in RevoGrid.MultiDimensionType]: ObservableMap<RevoGrid.DimensionSettingsState>};
    @Prop() viewports: {[T in RevoGrid.MultiDimensionType]: ObservableMap<RevoGrid.ViewportState>};


    /**
     * Custom editors register
     */
    @Prop() editors: Edition.Editors = {};

    @Prop() dataProvider: DataProvider;

    @Prop() uuid: string|null = null;
    @Prop() resize: boolean;
    @Prop() readonly: boolean;
    @Prop() range: boolean;
    @Watch('range') onRange(canRange: boolean): void {
        CellSelectionService.canRange = canRange;
    }

    /** Clear data which is outside of grid container */
    @Listen('click', { target: 'document' })
    handleOutsideClick(e: KeyboardEvent): void {
        const target: HTMLElement|null = e.target as HTMLElement;
        if (!target?.closest(`[${UUID}="${this.uuid}"]`)) {
            this.selectionStoreConnector.clearAll();
        }
    }

    connectedCallback(): void {
        this.selectionStoreConnector = new SelectionStoreConnector();
        this.scrollingService = new GridScrollingService({
            setViewport: (e: RevoGrid.ViewPortScrollEvent) => this.setViewportCoordinate.emit(e)
        });
        CellSelectionService.canRange = this.range;
    }

    disconnectedCallback(): void {
        this.scrollingService.destroy();
    }

    componentDidRender(): void {
        this.scrollingService.registerElements(this.elementToScroll);
    }

    render() {
        this.elementToScroll.length = 0;
        const rows: RevoGrid.VirtualPositionItem[] = this.viewports['row'].get('items');
        const cols: RevoGrid.VirtualPositionItem[] = this.viewports['col'].get('items');

        const contentHeight: number = this.dimensions['row'].get('realSize');

        const viewports: ViewportProps[] = [
            // left side
            this.pinnedColumnData(
                'colPinStart',
                `${this.uuid}-1`,
                rows,
                'colPinStart', {x: 0, y: 1},
                contentHeight
            ),

            // center
            this.centerData(
                'data-view',
                `${this.uuid}-0`,
                rows,
                cols,
                {x: 1, y: 1},
                contentHeight
            ),

            // right side
            this.pinnedColumnData(
                'colPinEnd',
                `${this.uuid}-2`, rows,
                'colPinEnd', {x: 2, y: 1},
                contentHeight
            )
        ];

        const viewPortHtml: HTMLElement[] = [];

        /** render viewports columns */
        for (let view of viewports) {
            const dataViews: HTMLElement[] = [];
            let j: number = 0;

            /** render viewports rows */
            for (let data of view.dataPorts) {
                dataViews.push(
                    <revogr-data
                        {...data}
                        {...{[UUID]: data.uuid}}
                        key={view.prop.key + (++j)}
                        readonly={this.readonly}
                        range={this.range}
                    >
                        <revogr-overlay-selection
                            {...data}
                            slot='overlay'
                            selectionStoreConnector={this.selectionStoreConnector}
                            editors={this.editors}
                            readonly={this.readonly}/>
                    </revogr-data>
                );
            }
            viewPortHtml.push(
                <revogr-viewport-scroll {...view.prop}
                    ref={el => this.elementToScroll.push(el)}
                    onScrollViewport={e => this.scrollingService.onScroll(e.detail, view.prop.key)}>

                    <revogr-header {...view.headerProp} slot='header' canResize={this.resize}/>
                    {dataViews}
                </revogr-viewport-scroll>
            );
        }
        return <Host{...{[`${UUID}`]: this.uuid}}>
            <div class='main-viewport'>
                <div class='viewports'>
                    {viewPortHtml}

                    <revogr-scroll-virtual
                        class='vertical'
                        contentSize={contentHeight}
                        ref={el => this.elementToScroll.push(el)}
                        virtualSize={this.viewports['row'].get('virtualSize')}
                        onScrollVirtual={e => this.scrollingService.onScroll(e.detail)}/>
                </div>
            </div>
            <revogr-scroll-virtual
                class='horizontal'
                dimension='col'
                contentSize={this.dimensions['col'].get('realSize')}
                ref={el => this.elementToScroll.push(el)}
                virtualSize={this.viewports['col'].get('virtualSize')}
                onScrollVirtual={e => this.scrollingService.onScroll(e.detail)}/>
        </Host>;
    }

    /** Collect data for pinned columns in required @ViewportProps format */
    private pinnedColumnData(
        key: RevoGrid.MultiDimensionType,
        uuid: string,
        rows: RevoGrid.VirtualPositionItem[],
        colType: RevoGrid.DimensionColPin,
        position: Selection.Cell,
        contentHeight: number
    ): ViewportProps {
        const colStore = this.columnStores[colType];
        const cols: RevoGrid.VirtualPositionItem[] = this.viewports[colType].get('items');
        const pinSize = this.dimensions[colType].get('realSize');
        const parent: string = `[${UUID}="${uuid}"]`;
        const prop: Properties = {
            contentWidth: pinSize,
            style: { minWidth: `${pinSize}px` },
            class: key,
            [`${UUID}`]: uuid,
            contentHeight,
            key,
        };
        const colData = colStore.get('items');
        const headerProp: Properties = {
            cols,
            parent,
            colData,
            dimensionCol: this.dimensions[colType],
            groups: colStore.get('groups'),
            groupingDepth: colStore.get('groupingDepth'),
            onHeaderResize: (e: CustomEvent<RevoGrid.ViewSettingSizeProp>) => this.setDimensionSize.emit({
                type: colType,
                sizes: e.detail
            })
        };

        return {
            prop,
            headerProp,
            parent,
            dataPorts: this.dataViewPort(rows, cols, colData, colType, position, uuid)
        };
    };


    /** Collect data for central(core) part */
    private centerData (
        key: string,
        uuid: string,
        rows: RevoGrid.VirtualPositionItem[],
        cols: RevoGrid.VirtualPositionItem[],
        position: Selection.Cell,
        contentHeight: number,
        colType: RevoGrid.DimensionCols = 'col'
    ): ViewportProps {
        const parent = `[${UUID}="${uuid}"]`;
        const colStore = this.columnStores[colType];
        const prop: Properties = {
            contentWidth: this.dimensions[colType].get('realSize'),
            class: key,
            [`${UUID}`]: uuid,
            onResizeViewport: (e: CustomEvent<RevoGrid.ViewPortResizeEvent>) => this.setViewportSize.emit(e.detail),
            contentHeight,
            key
        };
        const colData = colStore.get('items');
        const headerProp: Properties = {
            colData,
            cols,
            parent,
            dimensionCol: this.dimensions[colType],
            groups: colStore.get('groups'),
            groupingDepth: colStore.get('groupingDepth'),
            onHeaderResize: (e: CustomEvent<RevoGrid.ViewSettingSizeProp>) =>
                this.setDimensionSize.emit({ type: colType, sizes: e.detail })
        };
        return {
            prop,
            headerProp,
            parent,
            dataPorts: this.dataViewPort(rows, cols, colData, colType, position, uuid)
        };
    }

    /** Collect Row data */
    private dataViewPort(
        rows: RevoGrid.VirtualPositionItem[],
        cols: RevoGrid.VirtualPositionItem[],
        colData: RevoGrid.ColumnDataSchemaRegular[],
        colType: RevoGrid.MultiDimensionType,
        pos: Selection.Cell,
        uuid: string
    ): ViewportData[] {
        let lastCell = this.getLastCell(colType, 'row');
        const dataPart: ViewportData = {
            colData,
            position: pos,
            cols,
            rows,
            uuid: `${uuid}-${pos.x}-${pos.y}`,
            lastCell,
            dataStore: this.rowStores['row'],

            slot: 'content',
            dimensionCol: this.dimensions[colType],
            dimensionRow: this.dimensions['row']
        };
        const pinned = (type: RevoGrid.DimensionRowPin, slot: SlotType, y: number): ViewportData => {
            lastCell = this.getLastCell(colType, type);
            const position = { ...pos, y };
            return {
                ...dataPart,
                slot,
                lastCell,
                position,
                uuid: `${uuid}-${position.x}-${position.y}`,
                dataStore: this.rowStores[type],
                rows: this.viewports[type].get('items'),
                style: { height: `${this.dimensions[type].get('realSize')}px` },
                dimensionRow: this.dimensions[type],
            };
        };
        return [
            pinned('rowPinStart', 'header', 0),
            dataPart,
            pinned('rowPinEnd', 'footer', dataPart.position.y + 1)
        ];
    }


    /** Receive last visible in viewport by required type */
    private getLastCell(colType: RevoGrid.MultiDimensionType, rowType: RevoGrid.MultiDimensionType): Selection.Cell {
        return {
            x: this.viewports[colType].get('realCount'),
            y: this.viewports[rowType].get('realCount')
        };
    }
}
