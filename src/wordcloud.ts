'use strict';

import * as d3 from 'd3';
import * as d3cloud from 'd3-cloud';
import Dispatcher from './dispatcher';
import RadialHistogram from './radial-histogram';
import ColorScale from './color-scale';
import TimeScale from './time-scale';
import * as util from './utilities';

const outerRadius = 350;

export default class WordCloud {
  // members
  private _rootSelection: d3.Selection<SVGGElement, any, any, any>;
  private _dispatcher: Dispatcher;
  private _dispatch: d3.Dispatch<any>;
  private _colorScale: ColorScale;
  private _timeScale: TimeScale;
  private _data: Array<any>;
  private _radialHistogram: RadialHistogram;
  private _origin: util.Coordinate;
  private _settings: any
  private _countWords: Worker;
  private _layoutInsets: Worker;

  constructor(parent: SVGElement,
    dispatcher: Dispatcher,
    dispatch: d3.Dispatch<any>,
    colorScale: ColorScale,
    timeScale: TimeScale,
    data: Array<any>,
    origin: util.Coordinate,
    settings: any,
    countWords: Worker,
    layoutInsets: Worker
  ) {
    this._rootSelection = d3.select(parent)
      .append("g")
      .attr("id", "wordcloud") as d3.Selection<SVGGElement, any, any, any>;

    // create one virtual isoline for bbox
    this._rootSelection.append('circle')
      .classed('bounding-box', true)
      .attr('r', outerRadius - 100)
      .attr('fill', 'none');

    this._dispatcher = dispatcher;
    this._dispatch = dispatch;
    this._colorScale = colorScale;
    this._timeScale = timeScale;
    this._data = data;
    this._origin = origin;
    this._settings = settings;
    this._countWords = countWords;
    this._layoutInsets = layoutInsets;

    this.createOther();

    this.calculateWordcloudNew();
  }

  private colorForWeightedDates(dates: Array<Date>): Date {
    // get average point in time for list
    const avg = dates.reduce(function(accum: number, cur: Date) : number {
      return accum + cur.getTime();
    }, 0) / dates.length;
    return new Date(avg);
  }

  private calculateWordcloudNew() {
    this._countWords.onmessage = (ev: MessageEvent) => {
      this.layoutWordcloud(ev.data);
    };

    this._countWords.postMessage(this._data);
  }

  private layoutWordcloud(d: Array<any>): void {
    const ref = this;
    const scaleMax = d[0].score;
    const scaleMin = d[d.length - 1].score;

    const font_sizes = [12, 16, 20, 24];
    const font_scale = d3.scaleQuantize()
      .domain([font_sizes[0], font_sizes[font_sizes.length - 1]])
      .range(font_sizes);
    const size_scale = d3.scalePow()
      // perceptual scaling:
      // Flannery, 1971: The relative effectiveness of some common graduated
      //                 point symbols in the presentation of quantitative data.
      .exponent(0.5716)
      .domain([scaleMin, scaleMax])
      .range(font_scale.domain());

    var layout = d3cloud();
    layout.size([250, 250]);
    layout.padding(1.2);
    layout.rotate(0);
    layout.fontSize(function(d) {
      return font_scale(size_scale(d.score));
    });
    layout.on("end", function(words: Array<any>) {
      ref.draw(words, ref);
    });
    layout.words(d);

    layout.start();
  }

  private draw(words: Array<any>, ref: WordCloud) : void {
    const articles = words.map(d => d.articles)
      .map(d => ref._data.filter(e => d.includes(e.Index)));
    ref._rootSelection
      .selectAll<SVGTextElement, any>("text")
    .data(articles)
      .enter().append("text")
      .html((_, i) => words[i].text
        .replace(/ +/g, '<tspan opacity="0.5">&middot;</tspan>'))
      .attr("font-size", function(_, i) { return words[i].size + "px"; })
      .attr("font-family", "sans-serif")
      .attr("fill", "black")
      .attr("cursor", "default")
      .attr("text-anchor", "middle")
      .attr("transform", function(_, i) {
        return "translate(" + [words[i].x, words[i].y] + ")rotate(" + words[i].rotate + ")";
      })
      .attr("description", (_, i) => "\"" + words[i].text + "\"")
      .on("click", function(this: SVGTextElement, event: MouseEvent) {
        if (event.button == 0) {
          ref._dispatcher.restartWithSelections(d3.select(this) as d3.Selection<SVGTextElement, any, any, any>);
        }
      })
      .on("mouseenter", function(_, d) {
        ref._dispatcher.brushWithSelections(d3.select(this) as d3.Selection<SVGTextElement, any, any, any>);
        d3.select(this).style('font-weight', 'bold');
      })
      .on("mouseleave", function(_, d) {
        // remove brush
        ref._dispatcher.dispatch([]);
      }).on('contextmenu', function(event) {
        event.preventDefault();
        let t = d3.select(this);
        t.classed("selected", !t.classed("selected"));
      })
      .each(function(d, i) {
        let word = d3.select(this);
        let wordcolor = ref._colorScale.scale(words[i].dateAvg);
        const articles = new Set<number>(d.map(e => e.Index));
        let listener = {
          // called by dispatcher
          notify: function(data: Array<any>) {
            let color = data.some(d => articles.has(d.Index)) ? wordcolor : "black";
            word.style("fill", color);
          }
        }
        ref._dispatcher.addListener(listener);
      })
      .append('title')
      .text((_,i) => `${words[i].text}: ${words[i].occurences} occurences in ${words[i].count} documents.`);
  }

  private createOther() {
    const ref = this;
    // calculate angles for all articles
    let angled_data = ref._data.map(function(a) {
      let angle = util.greatCircleDistanceAndAngle(
        ref._origin,
        a.location.geometry.location,
        ref._settings.projection
      ).alpha;
      // normalise angle
      while (angle > 2*Math.PI) angle -= 2*Math.PI;
      while (angle < 0) angle += 2*Math.PI;
      a.angle = angle;
      return a;
    });

    // draw radial histogram around wordcloud
    const center = {
      x: 0,
      y: 0
    };
    ref._radialHistogram = new RadialHistogram(160, outerRadius, center, 180,
      ref._origin, angled_data, ref._dispatcher, ref._dispatch, ref._colorScale,
      ref._timeScale, ref._settings, this._layoutInsets);
    ref._dispatcher.addListener(ref._radialHistogram);
  }
}
