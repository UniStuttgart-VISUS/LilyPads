'use strict';

import * as d3 from 'd3';
import ColorScale from './color-scale';
import TimeScale from './time-scale';
import Dispatcher from './dispatcher';
import HistogramBar from './histogram-bar';

interface ChartData {
  x: number;
  y: number;
};

interface KeyValuePair<Key, Value> {
  key: Key;
  value: Value;
};

export default class DateHistogram {
  // members
  root:           HTMLElement;
  rootGroup:      d3.Selection<any, any, any, any>;
  axisLayer:      d3.Selection<any, any, any, any>;
  histogramLayer: d3.Selection<any, any, any, any>;
  background:     d3.Selection<SVGRectElement, any, any, any>;
  scaleX:         d3.AxisScale<string>;
  scaleY:         d3.AxisScale<number>;
  xAxis:          d3.Axis<string>;
  axisPainter:    d3.Selection<any, any, any, any>;

  data:           Array<any>;
  countPerDay:    Array<KeyValuePair<Date, number>>;

  dispatcher:     Dispatcher;
  colorScale:     ColorScale;
  timeScale:      TimeScale;
  histogram:      Array<HistogramBar> = [];

  height: number = 100;
  axisOffset: number = this.height - 60;


  constructor(dom_node: any,
    data: Array<any>,
    countPerDay: Array<KeyValuePair<Date, number>>,
    dispatcher: Dispatcher,
    colorScale: ColorScale,
    timeScale: TimeScale
  ) {
    this.dispatcher = dispatcher;
    this.colorScale = colorScale;
    this.timeScale = timeScale;

    this.data = data;
    this.countPerDay = countPerDay;

    this.initialize(dom_node);
  }

  onResize() : void {
    this.moveToBottomLeft();
    this.rescaleAxis();
  }

  initialize(node: any) : void {
    this.root = node;
    this.rootGroup = d3.select(node);

    this.background = (this.rootGroup.append('rect') as d3.Selection<SVGRectElement, any, any, any>)
      .attr('fill', 'white')
      .attr('opacity', 0.8);
    this.axisLayer = this.rootGroup.append("g")
    .attr("id", "axis-layer");
    this.histogramLayer = this.rootGroup.append("g")
    .attr("id", "histogram-layer");

    this.initAxis();
    this.moveToBottomLeft();
  }

  initAxis() : void {
    const b = this.box();
    this.scaleX = d3.scaleBand()
      .domain(this.timeScale.domain_labels())
      .range([0, b.width])
      .paddingInner(0.2)
      .paddingOuter(0.2);
    this.xAxis = d3.axisBottom<string>(this.scaleX as d3.AxisScale<string>);
    this.xAxis.ticks(this.timeScale.domain_labels());
    this.axisPainter = this.axisLayer.append("g")
      .attr("class", "axis axis--x")
      .attr("transform", "translate(0, " + this.axisOffset + ")")
      .attr("width", b.width)
      .call(this.xAxis);
    this.rotateLabels();

    let range = this.rescaleAxis();
    this.createHistogramBars();
  }

  private rotateLabels(): void {
    this.axisLayer.selectAll('text')
    .attr('transform', 'rotate(-45)translate(-8,0)')
    .style('text-anchor', 'end')
    .style('font-size', '8px');
  }

  rescaleAxis() : any {
    //const b = this.box();
    //let extent = this.timeScale.domain();
    //let startdate = new Date(extent[0].getTime() - 43200000);
    //let enddate = new Date(extent[1].getTime() + 43200000);
    //let arr : Array<number> = [ startdate.valueOf(), enddate.valueOf() ];
    //this.scaleX.domain(arr)
    //  .range([0,b.width]);

    //this.axisPainter.call(this.xAxis);
    //this.rotateLabels();
    //return {
    //  startdate: startdate,
    //  enddate: enddate
    //};
  }

  createHistogramBars() : void {
    const dateFormat = d3.timeFormat('%Y-%m-%d');
    this.scaleY = d3.scaleLinear().range([0, this.axisOffset - 1 ])
      .domain([0, d3.max<number>(this.countPerDay.map(d => d.value))]);
    // create y range scaler
    const widthPerBar = this.scaleX.bandwidth();
    this.countPerDay.forEach(function(kv: KeyValuePair<Date, number>) {
      const date = this.timeScale.label(kv.key);
      let datafordate = this.data.filter(d => this.timeScale.label(d.Date) == date);
      let hist = new HistogramBar(this.histogramLayer.node(),
        { x: this.scaleX(date) + 0.5*this.scaleX.bandwidth(), y: this.axisOffset },
        -Math.PI/2,
        this.scaleY(kv.value),
        this.colorScale.scaleAlpha(kv.key, 0.3),
        this.colorScale.scale(kv.key),
        kv.value,
        this.dispatcher,
        datafordate,
        date,
        { shape: 'rectangle', length: this.scaleY.range()[1], outerPadding: this.scaleX.paddingInner()/2 }
      );
      hist.setLineWidth(widthPerBar);
      hist.setTitle(date);

      this.histogram.push(hist);
    }, this);

    // create readability indicator
    this.histogramLayer.append('path')
      .attr('fill', 'DarkGray')
    .attr('d', 'M 0,0 L 0,10 5,5 Z')
      .attr('transform', 'translate(-10,' + (this.axisOffset - 10) + ')');

    const width = this.scaleX.range()[1] - this.scaleX.range()[0] + 40 + 10;
    this.background.attr('x', -40)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', this.height);
  }

  box() : any {
    const amount = this.timeScale.domain_labels().length;
    const width = Math.min(12 * amount, 400);

    return {
      width,
      height: this.height
    };
  }

  private moveToBottomLeft() {
    this.rootGroup.attr("transform", "translate(40, " + 0 + ")");
  }
}
