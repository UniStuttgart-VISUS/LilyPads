'use strict';

import * as d3 from 'd3';
import {BaseType} from 'd3-selection';
import * as util from './utilities';
import ColorScale from './color-scale';

export class ThickeningLine {
  // members
  private _segmentStartThickness : number;
  private _segmentMiddleThickness : number;
  private _start : util.Point;
  private _end : util.Point;
  private _startAngle : number;
  private _endAngle : number;
  private _color : string;
  private _brushedColor : string;

  private _line : d3.Selection<SVGPathElement, any, SVGPathElement, Array<util.Point>>;
  private _hiddenline : d3.Selection<SVGPathElement, any, SVGPathElement, Array<util.Point>>;

  private _svgElement : d3.Selection<SVGSVGElement, any, any, any>;

  // data
  private _date : number;
  private _locs : Set<string>;

  private _scale: number = 1;

  constructor(
    svgElement: d3.Selection<SVGSVGElement, any, any, any>,
    segmentStartThickness : number,
    segmentMiddleThickness : number,
    start : util.Point,
    end : util.Point,
    startAngle : number,
    endAngle : number
  ) {
    this._svgElement = svgElement;
    this._segmentStartThickness = segmentStartThickness;
    this._segmentMiddleThickness = segmentMiddleThickness;
    this._start = start;
    this._end =  end;
    this._startAngle = startAngle;
    this._endAngle = endAngle;

    this._color = '#d0d0d0';

    this.linesCreate();

    this.update();
  }

  setColorScale(s: ColorScale) {
    this._brushedColor = s.scale(new Date(this._date));
  }

  setScale(s: number) {
    this._scale = s;
  }

  private linesCreate() {
    this._line = this._svgElement.append<SVGPathElement>("path")
      .attr("id", "thickeningLine")
      .attr("stroke", this._color)
      .attr("stroke-width", 0.2)
      .attr("fill", this._color)
      .attr("opacity", 0.4)
      .attr("d", "");
    this._hiddenline = this._svgElement.append<SVGPathElement>("path")
      .attr("id", "hidden")
      .attr("fill", "none")
      .attr("d", "");
  }

  private update() {
    const linefunction = d3.line<util.Point>()
      .x(function(d) { return d.x; })
      .y(function(d) { return d.y; })
      .curve(d3.curveBasisClosed);
    const linefunction2 = d3.line<util.Point>()
      .x(function(d) { return d.x; })
      .y(function(d) { return d.y; })
      .curve(d3.curveBasis);

    const dist = Math.sqrt(
      Math.pow(this._start.x - this._end.x, 2)
      + Math.pow(this._start.y - this._end.y, 2)
    );
    const dummy_point_offset = Math.min(50, dist/3);

    const angle1 = this._startAngle + Math.PI/2;
    const angle2 = this._endAngle + Math.PI/2;

    // _start points
    const start = this._start;

    // _end points
    const end = this._end;

    // first dummies
    const inter1 = {
      x: start.x + dummy_point_offset * Math.cos(this._startAngle),
      y: start.y + dummy_point_offset * Math.sin(this._startAngle),
    };
    const inter2 = {
      x: end.x - dummy_point_offset * Math.cos(this._endAngle),
      y: end.y - dummy_point_offset * Math.sin(this._endAngle),
    };

    // hiddenline helps to find the middle part of the actual thickening line
    this._hiddenline.attr("d", linefunction2([start, inter1, inter2, end]));
    let path = this._hiddenline.node();
    let len = path.getTotalLength();
    let middle = path.getPointAtLength(len/2);
    let middle_epsilon = path.getPointAtLength(len/2 + 1);

    const angle3 = Math.atan2(middle.y - middle_epsilon.y, middle.x - middle_epsilon.x) + Math.PI/2;

    // thickening parts
    const inter3 = {
      x: middle.x + Math.cos(angle3) * this._segmentMiddleThickness/2,
      y: middle.y + Math.sin(angle3) * this._segmentMiddleThickness/2
    };
    const inter4 = {
      x: middle.x - Math.cos(angle3) * this._segmentMiddleThickness/2,
      y: middle.y - Math.sin(angle3) * this._segmentMiddleThickness/2
    };

    const l_ = [
      start, start,
      inter1,
      inter3,
      inter2,
      end, end,
      inter2,
      inter4,
      inter1
    ];
    this._line
      .attr("d", linefunction(l_))
      .attr("stroke", this._color)
      .attr("fill", this._color);
    this._line.datum(this);
  }

  // change end point
  setEnd(end: util.Point) {
    this.end = end;
    this.update();
  }

  setValues(newAttrs: any) {
    this.start = (newAttrs.start == undefined) ? this._start : newAttrs.start;
    this.end = (newAttrs.end == undefined) ? this._end : newAttrs.end;
    this.startAngle = (newAttrs.startAngle == undefined) ? this._startAngle : newAttrs.startAngle;
    this.endAngle = (newAttrs.endAngle == undefined) ? this._endAngle : newAttrs.endAngle;
    this.segmentStartThickness = (newAttrs.segmentStartThickness == undefined) ? this._segmentStartThickness : newAttrs.segmentStartThickness;
    this.segmentMiddleThickness = (newAttrs.segmentMiddleThickness == undefined) ? this._segmentMiddleThickness : newAttrs.segmentMiddleThickness;
    this.color = (newAttrs.color == undefined) ? this._color : newAttrs.color;

    this.update();
  }

  // BRUSH
  notify(data: Array<any>) {
    const min_activated_width = 5;
    const data_for_this = data.filter(d => this._locs.has(d.place_id) && this._date === d.Date.getTime()).length;

    this.color = data_for_this ? this._brushedColor : "#d0d0d0";
    this.segmentMiddleThickness = data_for_this
         ? Math.max(this._scale*data_for_this, min_activated_width)
         : 0;
    this.update();
  }

  setDateAndLocs(date: Date, locs: Array<string>) {
    this._date = (date != null) ? date.getTime() : null;
    this._locs = new Set<string>(locs);
  } 

  /* SETTERS */
  set start(start: util.Point) {
    this._start = start;
  }
  set end(end: util.Point) {
    this._end = end;
  }
  set startAngle(angle: number) {
    this._startAngle = angle;
  }
  set endAngle(angle: number) {
    this._endAngle = angle;
  }
  set segmentStartThickness(thickness: number) {
    this._segmentStartThickness = thickness;
  }
  set segmentMiddleThickness(thickness: number) {
    this._segmentMiddleThickness = thickness;
  }
  set color(color: string) {
    this._color = color;
  }
}
