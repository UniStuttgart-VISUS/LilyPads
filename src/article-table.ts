'use strict';

import * as d3 from 'd3';

import Dispatcher from './dispatcher';
import ColorScale from './color-scale';
import SmallMultiples from './small-multiples';

const columns = ["Index", "Date", "Title (Newspaper)", "Location"];
const formatDate = d3.timeFormat("%B %d, %Y");

export default class ArticleTable {
  private _root:    d3.Selection<HTMLDivElement, any, any, any>;
  private _div:     d3.Selection<HTMLDivElement, any, any, any>;
  private _table:   d3.Selection<HTMLElement, any, any, any>;
  private _thead:   d3.Selection<HTMLElement, any, any, any>;
  private _tbody:   d3.Selection<HTMLElement, any, any, any>;

  private _smallMultiples: SmallMultiples;

  private _corpus: string;

  private _dispatcher: Dispatcher;
  private _colorScale: ColorScale;

  private _sortedBy: string = 'Index';

  private _data: Array<any>;

  constructor(root: d3.Selection<HTMLDivElement, any, any, any>,
    dispatcher: Dispatcher,
    colorScale: ColorScale,
    data: Array<any>,
    corpus: string
  ) {
    this._root = root;
    this._dispatcher = dispatcher;
    this._colorScale = colorScale;
    this._data = data;
    this._corpus = corpus;

    this.createSortButtons();

    this._div = root.select('.sidebar__documents-table');
    this._table = this._div.append("table")
      .classed("fixed-header", true) as d3.Selection<HTMLElement, any, any, any>;
    this._tbody = this._table.append("tbody").attr("id", "table-body") as d3.Selection<HTMLElement, any, any, any>;

    dispatcher.addListener(this);
    this.updateDataset(data);

    this._div.on('scroll', () => this.updateVisibleDocuments());

    this._smallMultiples = new SmallMultiples(this._root.select('#small-multiples'), data, this._colorScale, this._dispatcher);

    this.updateVisibleDocuments();
  }

  updateDataset(data: Array<any>) : void {
    this._tbody.selectAll('tr').remove();
    let rows = this._tbody.selectAll('tr')
      .data(data)
      .enter()
      .append('tr')
      .classed('table-row', true)
      .style('background', 'white');
    rows.selectAll('td')
      .data(function(row) {
        return columns.map(function(column) {
          if (column == "Date") {
            return {column:column, value: formatDate(row[column])};
          }
          return {column: column, value: row[column]};
        });
      })
      .enter()
      .append("td")
      .html(function(d) { return d.value; });

    let ref = this;
    rows.on('mouseenter', function(datum) {
      ref._dispatcher.dispatch([datum]);
    }).on('mouseleave', function(datum) {
      ref._dispatcher.dispatch([]);
    }).on('click', function(datum) {
      window.open('./api/articles/' + ref._corpus + '/' + datum.Index);
    });

    d3.select("#counter")
      .text(data.length + " article" + (data.length != 1?"s":"") + " visible");
  }

  notify(data: Array<{Index: number}>) {
    this._tbody.selectAll('tr')
      .style('background', null);
    if (data.length) {
      const articles = new Set<number>(data.map(d => d.Index));
      this.visible()
        .filter(d => articles.has(d.Index))
        .style('background', datum => this._colorScale.scale(datum.Date));
    }
  }

  private createSortButtons() {
    let div = this._root.select('#buttons');
    div.selectAll('input').on('change', console.log);
    
    div.select('input#Index').on('change', () => this.recheckSorting('Index'));
    div.select('input#Date').on('change', () => this.recheckSorting('Date'));
    div.select('input#Location').on('change', () => this.recheckSorting('Location'));

    div.select('label#Index').classed('active', true);
    div.select('input#Index').property('checked', true);
  }

  private recheckSorting(by: string) {
    if (by == this._sortedBy) return;
    this._sortedBy = by;

    const sort_fns = {
      Index: (d1, d2) => d1.Index - d2.Index,
      Date: (d1, d2) => d1.Date - d2.Date,
      Location: (d1, d2) => d1.Location.localeCompare(d2.Location)
    };
    let data = this._data.sort(sort_fns[by]);
    this.updateDataset(data);

    let idx_to_idx = new Map<string, number>();
    data.forEach((d, i) => idx_to_idx.set(d.Index, i));
    this._smallMultiples.rearrange(idx_to_idx).then(d => this.updateVisibleDocuments());
  }

  updateVisibleDocuments() {
    this._smallMultiples.updateVisible(this.visibleDocuments() as any as string[]);
  }

  private visibleDocuments(): Array<number> {
    return this.visible()
      .data()
      .map(d => d.Index);
  }

  private visible(): d3.Selection<HTMLTableRowElement, {Index: number, Date: Date}, any, any> {
    const div_rect = this._div.node().getBoundingClientRect();

    return this._tbody.selectAll<HTMLTableRowElement, {Index: number, Date: Date}>('tr')
      .filter(function() {
        const rect = this.getBoundingClientRect();
        return rect.top <= div_rect.bottom && rect.bottom >= div_rect.top;
      });
  }
}
