'use strict';

import * as d3 from 'd3';
import * as util from './utilities';
import Dispatcher from './dispatcher';

interface EndListener {
  setPointAndAngle(end: util.Point, angle: number);
};

interface RectangularInteractionArea {
  shape: 'rectangle';
  length: number;
  outerPadding: number;
};
interface ArcInteractionArea {
  shape: 'arc';
  center: { x: number, y: number };
  innerRadius: number;
  outerRadius: number;
  startAngleDelta: number;
  endAngleDelta: number;
};

const minimal_bar_length = 5;

export default class HistogramBar {
  private _start         : util.Point;
  private _end           : util.Point;
  private _angle         : number;
  private _length        : number;

  private _bgColor       : string;
  private _fgColor       : string;

  private _root          : d3.Selection<SVGGElement, any, any, any>;
  private _bgLine        : d3.Selection<d3.BaseType, number, any, any>;
  private _fgLine        : d3.Selection<d3.BaseType, number, any, any>;
  private _background    : d3.Selection<d3.BaseType, number, any, any>;
  private _area          : d3.Selection<SVGPathElement, RectangularInteractionArea | ArcInteractionArea, any, any>;

  private _interactionAreaData: RectangularInteractionArea | ArcInteractionArea;

  private _lineFunction  : d3.Line<util.Point>;

  private _lineWidth     : number;

  private _endListeners  : Array<EndListener>;

  private _value         : number;

  private _dispatcher    : Dispatcher;

  private _indices       : Set<number>;

  constructor(root: string | d3.BaseType,
    start: util.Point,
    angle: number,
    length: number,
    bgColor: string,
    fgColor: string,
    value: number,
    dispatcher: Dispatcher,
    data: Array<any>,
    description: string,
    interactionArea: RectangularInteractionArea | ArcInteractionArea
  ) {
    //console.log(data); console.trace();
    this._start = start;
    this._angle = angle;
    this._length = length ? Math.max(minimal_bar_length, length) : 0;
    this._value = value;
    this._end = {
      x: this._start.x + Math.cos(this._angle) * this._length,
      y: this._start.y + Math.sin(this._angle) * this._length
    };

    this._bgColor = bgColor;
    this._fgColor = fgColor;

    this._interactionAreaData = interactionArea;

    this._lineWidth = 5;

    this._endListeners = [];

    this._indices = new Set();

    this._dispatcher = dispatcher;
    this._dispatcher.addListener(this);

    this.init(root, data, description);
    this.setTitle(description);
  }

  setStartAndAngle(start: util.Point, angle: number, center: {x:number, y:number}) {
    this._start = start;
    this._angle = angle;
    this._end = {
      x: this._start.x + Math.cos(this._angle) * this._length,
      y: this._start.y + Math.sin(this._angle) * this._length
    };
    if (this._interactionAreaData.shape === 'arc') {
      (<ArcInteractionArea>(this._interactionAreaData)).center = center;
    }

    this._fgLine
      .datum(0)
      .attr("d", d => this.linedata(d));
    this._bgLine
      .datum(this._length)
      .attr("d", d => this.linedata(d));
    this._background
      .datum(this._length)
      .attr("d", d => this.linedata(d));
    this._root.select('.selection-marker')
      .datum(this._length + 1)
      .attr("d", d => this.linedata(d));

    this.updateInteractionArea();

    this.notifyListeners();
  }

  on(event: string, handler: any) : void {
    this._root.on(event, handler);
  }

  private init(root: string | d3.BaseType, data: Array<any>, description: string) {
    data.forEach(d => this._indices.add(d.Index));
    if (data.length != this._indices.size) console.trace();

    this._lineFunction = d3.line<util.Point>()
      .x(d => d.x)
      .y(d => d.y);

    let rootElem : d3.Selection<d3.BaseType, any, any, any>;
    if (typeof(root) == 'string') rootElem = d3.select(root as string);
    else rootElem = d3.select(root as d3.BaseType);
    this._root = rootElem.append("g");
    this._root.datum(data);
    this._root.attr('description', description);

    // create fg and bg rect
    this._root.append("path")
      .classed("selection-marker", true)
      .datum(this._length + 1)
      .attr("stroke", "red")
      .attr("stroke-width", this._lineWidth+2)
      .attr("fill", "none")
      .attr("d", d => this.linedata(d));

    this._background = this._root.append("path")
      .datum(this._length)
      .attr("stroke", "white")
      .attr("stroke-width", this._lineWidth)
      .attr("d", d => this.linedata(d));

    this._bgLine = this._root.append("path")
      .attr("id", "bg-line")
      .datum(this._length)
      .attr("stroke", this._bgColor)
      .attr("stroke-width", this._lineWidth)
      .attr("fill", "none")
      .attr("d", d => this.linedata(d));

    this._fgLine = this._root.append("path")
      .attr("id", "fg-line")
      .datum(0)
      .attr("stroke", this._fgColor)
      .attr("stroke-width", this._lineWidth)
      .attr("fill", "none")
      .attr("d", d => this.linedata(d));

    this.updateInteractionArea();

    // events
    let ref = this;
    this._root.on("mouseover", function() {
      d3.event.stopPropagation();
      ref._dispatcher.brushWithSelections(ref._root);
    }).on("mouseleave", function() {
      d3.event.stopPropagation();
      ref._dispatcher.dispatch([]);
    }).on("click", function() {
      if (d3.event.button == 0) {
        d3.event.stopPropagation();
        ref._dispatcher.restartWithSelections(ref._root);
      }
    }).on('contextmenu', function() {
      d3.event.preventDefault();
      d3.event.stopPropagation();
      ref._root.classed("selected", !ref._root.classed("selected"));
    });
  }

  private updateInteractionArea(): void {
    if (this._interactionAreaData.shape === 'rectangle') {
      const d = this._interactionAreaData as RectangularInteractionArea;

      const linedata: [number, number][] = [
        [
          this._start.x + (this._lineWidth + d.outerPadding) * Math.cos(this._angle + Math.PI/2),
          this._start.y + (this._lineWidth + d.outerPadding) * Math.sin(this._angle + Math.PI/2)
        ], [
          this._start.x + (this._lineWidth + d.outerPadding) * Math.cos(this._angle + Math.PI/2) + d.length * Math.cos(this._angle),
          this._start.y + (this._lineWidth + d.outerPadding) * Math.sin(this._angle + Math.PI/2) + d.length * Math.sin(this._angle)
        ], [
          this._start.x - (this._lineWidth + d.outerPadding) * Math.cos(this._angle + Math.PI/2) + d.length * Math.cos(this._angle),
          this._start.y - (this._lineWidth + d.outerPadding) * Math.sin(this._angle + Math.PI/2) + d.length * Math.sin(this._angle)
        ], [
          this._start.x - (this._lineWidth + d.outerPadding) * Math.cos(this._angle + Math.PI/2),
          this._start.y - (this._lineWidth + d.outerPadding) * Math.sin(this._angle + Math.PI/2)
        ]
      ];

      const sel = this._root.selectAll<SVGPathElement, any>('.interaction-area')
        .data([d]);
      sel.enter()
        .append('path')
        .attr('opacity', 0)
        .attr('stroke-width', 0)
        .classed('interaction-area', true)
        .merge(sel)
        .attr('d', d3.line()(linedata));
      sel.exit().remove();
    } else {
      const d = this._interactionAreaData as ArcInteractionArea;

      const linedata = d3.arc()
        .innerRadius(d.innerRadius)
        .outerRadius(d.outerRadius)
        .startAngle(this._angle + Math.PI/2 + d.startAngleDelta)
        .endAngle(this._angle + Math.PI/2 + d.endAngleDelta)(<any>{});

      const sel = this._root.selectAll<SVGPathElement, any>('.interaction-area')
        .data([d]);
      sel.enter()
        .append('path')
        .attr('opacity', 0)
        .classed('interaction-area', true)
        .merge(sel)
        .attr('d', linedata);
      sel.exit().remove();
    }
  }

  setTitle(title: String): void {
    // remove old title if exists
    this._root.selectAll('title').remove();
    // append new title
    this._root.append('title').text(title + "");
  }

  notify(data: Array<any>) {
    this.setValue(data.filter(d => this._indices.has(d.Index)).length);
  }

  private setValue(value: number) {
    if (isNaN(value)) {
      console.trace();
      return; // TODO
    }
    const actualValue = this._value
      ? value
      ? Math.max(minimal_bar_length, value * this._length / this._value)
      : 0
      : 0;
    this._fgLine
      .datum(this._value ? value * this._length / this._value : 0)
      .attr("d", d => this.linedata(d));
  }

  private setTotalValue(value: number) {
    this._value = value;
    this._fgLine
      .datum(0)
      .attr("d", d => this.linedata(d));
    this._bgLine
      .datum(this._length)
      .attr("d", d => this.linedata(d));
    this._root.select('.selection-marker')
      .datum(this._length+1)
      .attr("d", d => this.linedata(d));
    this._end = {
      x: this._start.x + Math.cos(this._angle) * this._length,
      y: this._start.y + Math.sin(this._angle) * this._length
    };
    this.notifyListeners();
  }

  private linedata(d: number) {
    if (isNaN(d)) {
      console.log(this._value, this._length);
      console.trace();
      return; // TODO
    }
    let endpos = {
      x: this._start.x + Math.cos(this._angle) * d,
      y: this._start.y + Math.sin(this._angle) * d
    };
    return this._lineFunction([this._start, endpos]);
  }

  setLineWidth(w: number) {
    if (w > 0) {
      this._lineWidth = w;
      this._fgLine.attr("stroke-width", w);
      this._bgLine.attr("stroke-width", w);
      this._background.attr('stroke-width', w);
      this._root.select('.selection-marker').attr("stroke-width", w+1);
    }
  }

  registerEndListener(l: EndListener) {
    this._endListeners.push(l);
  }

  notifyListeners() {
    this._endListeners.forEach(l => l.setPointAndAngle(this._end, this._angle + Math.PI));
  }

  // GETTERS
  get end(): util.Point {
    return this._end;
  }

  get angle(): number {
    return this._angle;
  }
}
