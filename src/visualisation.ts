'use strict';

import * as d3 from 'd3';
import * as utilities from './utilities';
import DateHistogram from './date-histogram';
import Dispatcher from './dispatcher';
import ColorScale from './color-scale';
import WordCloud from './wordcloud';
import ArticleTable from './article-table';
import {getSettings,setSettings,onSettingsChangedReload,onScaleChange,initMap} from './settings';
import TimeScale from './time-scale';
import LanguageBar from './language-bar';

// date utilities
const parseDate = d3.timeParse("%Y-%m-%d");

interface WebWorkers {
  wordcloudCount: Worker;
  insetLayout: Worker;
};

class Visualisation {
  private data: Array<any>;
  private dispatcher: Dispatcher;
  private colorScale: ColorScale;
  private timeScale: TimeScale;
  private recenter: d3.Dispatch<any>;

  private countPerDay: any;

  private wordCloud: WordCloud;
  private table: ArticleTable;
  private dateHistogram: DateHistogram;
  private languageBar: LanguageBar;

  private origin: utilities.Coordinate;

  constructor(data: Array<any>,
    svgContent: d3.Selection<SVGGElement, any, any, any>,
    timeaxis: d3.Selection<SVGGElement, any, any, any>,
    recenterContent,
    restartVis,
    settings,
    workers: WebWorkers
  ) {
    this.data = data;

    const colours = settings.colour_scale;
    const dateextent = d3.extent<Date>(this.data.map(d => d.Date));
    this.colorScale = new ColorScale(dateextent, colours, settings.neutral);
    this.timeScale = new TimeScale(dateextent[0], dateextent[1], 34);

    const ref = this;
    this.countPerDay = Array.from(this.data.reduce(function(acc, datum) {
      const date_nr = ref.timeScale.invert(ref.timeScale.label(datum.Date)).valueOf();
      if (acc.has(date_nr)) acc.set(date_nr, acc.get(date_nr) + 1);
      else acc.set(date_nr, 1);

      return acc;
    }, new Map<number, number>()))
      .map(([key, value]) => {
        return {
          key: new Date(key),
          value
        };
      });

    const languages = new Set<string>(data.map(d => d.Language));
    const countPerLanguage = Array.from(languages)
      .map(language => {
        const _data = data.filter(d => d.Language === language);
        return {
          key: language,
          value: _data.length,
          data: _data
        };
      });

    this.dispatcher = new Dispatcher();
    this.recenter = d3.dispatch<any>('recenter-content', 'restart');

    this.origin = settings.origin;

    // components
    this.table = new ArticleTable(d3.select(".sidebar"),
      this.dispatcher,
      this.colorScale,
      this.data,
      settings.dataset || "cs1");

    this.wordCloud = new WordCloud(svgContent.node(),
      this.dispatcher,
      this.recenter,
      this.colorScale,
      this.timeScale,
      this.data,
      this.origin,
      settings,
      workers.wordcloudCount,
      workers.insetLayout
    );

    this.dateHistogram = new DateHistogram(timeaxis.node(),
      this.data, this.countPerDay,
      this.dispatcher, this.colorScale, this.timeScale);

    this.languageBar = new LanguageBar(countPerLanguage, this.colorScale, this.dispatcher);

    this.recenter.on("recenter-content", recenterContent);
    this.dispatcher.setRestart(restartVis);
  }

  onResize() {
    this.recenter.call("recenter-content");
    this.dateHistogram.onResize();

    this.resizeSideBar();
  }

  resizeSideBar() {
    this.table.updateVisibleDocuments();
  }

  getData(): Array<any> {
    return this.data;
  }
}

export default class VisualisationHandler {
  private mapDiv: d3.Selection<HTMLDivElement, any, any, any> = d3.select("#map-div");
  private mainSvg: d3.Selection<SVGSVGElement, any, any, any>;
  private timeaxis: d3.Selection<SVGGElement, any, any, any>;
  private svgContent: d3.Selection<SVGGElement, any, any, any>;
  private transformGroup: d3.Selection<SVGGElement, any, any, any>;

  private vis: Visualisation;
  private drilldownStack: Array<{ data: Array<any>, description: string }> = [];
  private currentDrilldownIndex: number = 0;

  private backButton: d3.Selection<HTMLButtonElement, any, any, any>;

  private settings : any = {};

  private webworkers: WebWorkers;

  constructor() {
    this.createBackgroundMap();
    this.createCounter();

    this.webworkers = {
      wordcloudCount: new Worker('dist/workers/wordcloud-count.js'),
      insetLayout: new Worker('dist/workers/layout-insets.js'),
    };
  }

  /**
   * Recenter the content of the svgContent group. Also scale it if it is
   * larger than the viewport.
   */
  private recenterContent() : void {
    const svgWidth = this.mapDiv.node().clientWidth;
    const svgHeight = this.mapDiv.node().clientHeight;

    this.mainSvg.attr('viewBox', null);

    const bbox = this.calculateScreenBoundingBox(this.svgContent.selectAll('.bounding-box'));

    const padding = 10;

    const viewbox = [ bbox.x - padding, bbox.y - padding, bbox.width + 2*padding, bbox.height + 2*padding ].join(' ');
    this.mainSvg.attr('viewBox', viewbox);
  }

  private calculateScreenBoundingBox(elems: d3.Selection<SVGGraphicsElement, any, any, any>): DOMRect {
    const nodes = elems.nodes();
    if (nodes.length) {
      const initial = { x: Infinity, y: Infinity, width: -Infinity, height: -Infinity,
        top: Infinity, bottom: -Infinity, right: -Infinity, left: Infinity };

      return nodes
        .reduce(function(bbox: DOMRect, node) {
          const b2 = node.getBBox() as DOMRect;
          const m = node.getCTM();

          const bx = b2.x + m.e;
          const by = b2.y + m.f;
          const x = Math.min(bx, bbox.x);
          const y = Math.min(by, bbox.y);
          const right = Math.max(bbox.right, bx + b2.width);
          const bottom = Math.max(bbox.bottom, by + b2.height);
          const width = right - x;
          const height = bottom - y;

          return new DOMRect(x, y, width, height);
        }, initial) as DOMRect;
    } else {
      throw new Error('Empty selection');
    }
  }

  /**
   * Create the svg for the background. Populates the global variables
   * transformGroup and svgContent.
   */
  private createBackgroundMap() : void {
    const svgWidth = this.mapDiv.node().clientWidth;
    const svgHeight = this.mapDiv.node().clientHeight;

    let svg = this.mapDiv.append("svg")
      .attr('id', 'outer-svg');
    this.mainSvg = (svg.append('svg') as d3.Selection<SVGSVGElement, any, any, any>)
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('viewBox', `${-svgWidth/2} ${-svgHeight/2} ${svgWidth} ${svgHeight}`)
      .attr("id", "bg-map-svg");
    this.transformGroup = (this.mainSvg.append("g") as d3.Selection<SVGGElement, any, any, any>)
      .attr("id", "outer-content-transform-group");
    // content of this group will not be part of the rezooming bounding box
    this.transformGroup.append("g")
      .attr("id", "no-sideeffect-content");
    this.svgContent = (this.transformGroup
      .append("g") as d3.Selection<SVGGElement, any, any, any>)
      .attr("id", "content");
    this.timeaxis = (this.mapDiv.append('svg')
      .classed('date-histogram-svg', true)
      .attr('width', '450')
      .attr('height', '100')
      .append('g') as d3.Selection<SVGGElement, any, any, any>)
      .attr("id", "#date-histogram");
  }

  /**
   * Create the article counter.
   */
  private createCounter() {
    let counter = d3.select("#counter");
    counter.style("text-align", "center")
      .style("color", "white")
      .style("font-family", "Sans Serif")
      .style("font-size", "regular")
      .attr("id", "counter");
    counter.on("click", ()=>{});// TODO

    // back button
    let ref = this;
    this.backButton = (d3.select("#back-button")
      .append("button")) as d3.Selection<HTMLButtonElement, any, any, any>;
    this.backButton.attr("id", "back")
      .attr("class", "frameless")
      .attr('title', 'Back one step in drilldown')
      .style("font-size", "large")
      .style("color", "white")
      .on("click", function() {
        ref.backInDrilldownStack();
      })
      .append("i")
      .classed("fa", true)
      .classed("fa-undo", true);

    this.updateBackButton();
  }

  /**
   * Remove all the content from the visualisation. But not the things that
   * were there before.
   */
  cleanup() {
    this.transformGroup.select("g#content").selectAll("*").remove();
    this.transformGroup.select("g#no-sideeffect-content").selectAll("*").remove();
    this.timeaxis.selectAll("*").remove();
    d3.select("div#result-list").selectAll("*").remove();
    d3.select("div#counter").text("");
  }

  launch() : Promise<void> {
    let ref = this;
    return getSettings()
    .then(async settings => {
      ref.settings = settings;
      const response = await fetch(`./data/${settings.dataset}.json`);
      if (response.ok) return response.json();

      if (response.status === 404 || response.status === 403) {
        window.alert('The requested dataset could not be fetched. Redirecting to dataset selection.');
        const loc = window.location;
        const new_path = loc.pathname.replace(/index.html$/, 'change_dataset');
        const new_loc = `${loc.origin}${new_path}`;
        window.location.replace(new_loc);
      } else {
        throw new Error(`Unexpected status code: ${response.status} ${response.statusText}`);
      }
    })
    .then(function({articles, geolocations}: {articles: Array<any>, geolocations: any}) {
      return articles.map(d => {
        d.Date = parseDate(d.Date);

        // enrich with geographical location
        d.location = geolocations[d.place_id];

        return d;
      });
    })
    .then(function(data) {
      ref.drilldownStack.push({data, description: 'all'});
      ref.newVis(data);
      ref.vis.resizeSideBar();
      ref.updateDrilldownRow();
    });
  }

  reloadSettings() : void {
    let ref = this;
    getSettings()
      .then(function(settings) {
        ref.settings = settings;
      })
      .then(function() {
        ref.newVis(ref.vis.getData());
      });
  }

  private newVis(subset: Array<any>) {
    // cancel running worker methods
    Object.values(this.webworkers)
      .forEach(worker => worker.onmessage = _ => {});

    let ref = this;
    this.cleanup();
    this.vis = new Visualisation(subset, this.svgContent, this.timeaxis,
      function() { ref.recenterContent(); },
      function(data: Array<any>, description: string) { ref.restartWithSubsetOfData(data, description); },
      this.settings, this.webworkers);
    this.vis.resizeSideBar();
    window.addEventListener("resize", function() {
      ref.vis.onResize();
    });
  }

  private restartWithSubsetOfData(subset: Array<any>, description: string) {
    // do not do this if new subset is the same as old
    if (this.vis && subset.length == this.vis.getData().length) {
      // most probably same data, but check anyways
      let idx = this.vis.getData().map(d => d.Index);
      let idx2 = subset.map(d=>d.Index);

      idx.sort(); idx2.sort();

      const same = idx.map((d, i) => d == idx2[i])
        .reduce((a,b) => a && b, true);
      if (same) return;
    }

    this.drilldownStack.splice(this.currentDrilldownIndex + 1);
    this.currentDrilldownIndex += 1;
    this.drilldownStack.push({ data: subset, description: description });
    this.newVis(subset);

    this.updateBackButton();
    this.updateDrilldownRow();
  }

  private backInDrilldownStack() {
    if (this.currentDrilldownIndex === 0) return;
    this.revertDrilldownToDepth(this.currentDrilldownIndex - 1);
  }

  private revertDrilldownToDepth(depth: number): void {
    if (this.drilldownStack.length <= depth - 1) {
      console.error('revert too deep: ', depth);
      return;
    }

    this.currentDrilldownIndex = depth;
    const data = this.drilldownStack[depth].data;

    this.newVis(data);
    this.updateBackButton();
    this.updateDrilldownRow();

  }

  private updateBackButton() {
    this.backButton.style("visibility",
      (this.currentDrilldownIndex > -1) ? "visible" : "hidden");
  }

  private updateDrilldownRow() {
    const vis = this;
    const current = this.vis.getData();
    let sel = d3.select('div#drilldown-stack-row')
      .selectAll('span')
      .data(this.drilldownStack) as d3.Selection<HTMLSpanElement, any, any, any>;

    // ENTER + UPDATE
    sel.enter()
      .append('span')
      .classed('drilldown-row-element', true)
      .merge(sel)
      .each(function(d, i) {
        const ref = d3.select(this);
        ref.selectAll('*').remove();
        if (i !== 0) {
          ref.append('i')
            .classed('fa', true)
            .classed('fa-caret-right', true)
            .classed('padded', true)
            .classed('drilldown-row-element__caret', true);
        }
        const text = ref.append('text')
          .classed('drilldown-row-element__text', true)
          .text(d.description);
        if (i !== vis.currentDrilldownIndex) {
          text.attr('title', vis.drilldownStack[i].data.length + ' articles');
          text.classed('drilldown-row-element__link', true)
            .classed('drilldown-row-element__link--overshot', i > vis.currentDrilldownIndex);
          text.on('click', () => {
            vis.revertDrilldownToDepth(i);
          });
        } else {
          text.classed('drilldown-row-element__text--current', true)
            .attr('title', current.length + ' articles (current)');
        }
      });
    // EXIT
    sel.exit().remove();
  }

  saveSettings() : Promise<void> {
    this.closeSettings();
    this.settings = onSettingsChangedReload();
    this.newVis(this.vis.getData());
    return setSettings(this.settings)
      .catch(console.error);
  }

  resetSettings(): Promise<void> {
    this.closeSettings();
    return getSettings().then(_ => {});
  }

  closeSettings(): void {
    d3.select('.open-settings-button').classed('open-settings-button--open', false);
    d3.select('.modal-background').property('hidden', true);
  }

  openSettings(): void {
    d3.select('.open-settings-button').classed('open-settings-button--open', true);
    d3.select('.modal-background').property('hidden', false);
    onScaleChange();
  }

  onChange() : void {
    onScaleChange();
  }

  createMap() : void {
    initMap(this.settings, () => this.reloadSettings(), () => this.resetSettings());
  }
}

