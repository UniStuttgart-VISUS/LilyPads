"use strict";

import * as d3 from 'd3';
import { hcluster } from 'tayden-clusterfck';

import * as utilities from './utilities';
import * as mapinset from './map-inset';
import * as linerender from './line-render';
import HistogramBar from './histogram-bar';
import Dispatcher from './dispatcher';
import ColorScale from './color-scale';
import TimeScale from './time-scale';


export default class RadialHistogram {
  // members
  innerRadius: number;
  outerRadius: number;
  center: utilities.Point;
  binCount: number;
  maxCount: number;
  lineFunction: d3.Line<utilities.Point>;

  bins: Array<HistogramBar>;

  data: Array<any>;

  settings: any;

  origin: utilities.Coordinate;
  locations_for_bin: Array<any>;
  splines: Array<linerender.ThickeningLine> = [];

  // selectors
  totalGroup: d3.Selection<any, any, any, any>;
  histogramBars: d3.Selection<d3.BaseType, any, any, any>;
  insetGroup: d3.Selection<any, any, any, any>;
  innerCircle: d3.Selection<any, any, any, any>;
  lines: d3.Selection<any, any, any, any>;
  insets: Array<mapinset.MapInset>;
  dates: Array<any>;
  dispatch: d3.Dispatch<any>;
  dispatcher: Dispatcher;
  colorScale: ColorScale;
  timeScale: TimeScale;
  private _layoutInsets: Worker;

  lengthScaleInsets: d3.ScaleLinear<number, number>;
  lengthScale: d3.ScaleLinear<number, number>;

  constructor(innerRadius : number,
    outerRadius : number,
    center : utilities.Point,
    binCount : number, 
    origin : utilities.Coordinate,
    data : Array<any>,
    dispatcher : Dispatcher,
    dispatch: d3.Dispatch<any>,
    colorScale : ColorScale,
    timeScale : TimeScale,
    settings : any,
    layoutInsets: Worker
  ) {
    this.innerRadius = innerRadius;
    this.outerRadius = outerRadius;
    this.center = center;
    this.binCount = binCount;
    this.origin = origin;
    this.data = data;
    this.dispatcher = dispatcher;
    this.dispatch = dispatch;
    this.colorScale = colorScale;
    this.timeScale = timeScale;
    this.settings = settings;
    this._layoutInsets = layoutInsets;

    this.maxCount = data.length;

    this.insets = [];
    this.bins = [];
    this.locations_for_bin = [];

    this.lineFunction = d3.line<utilities.Point>()
      .x(function(d) { return d.x; })
      .y(function(d) { return d.y; })
      .curve(d3.curveBasis);

    this.initialize();
  }

  notify(data: Array<any>) {
  }

  onResize() {
    // do nothing for now
  }

  initialize() {
    // outer group
    this.totalGroup = d3.select("g#content")
      .append("g")
      .attr("id", "radial-histogram");

    this.lines = this.totalGroup.append("g")
      .attr("id", "lines")
      .classed('bounding-box', true);
    this.histogramBars = this.totalGroup.append("g")
      .attr("id", "histogram-bars")
      .classed('bounding-box', true);
    this.insetGroup = this.totalGroup.append("g")
      .attr("id", "inset-layer");

    // create innerRadius circle
    this.innerCircle = this.totalGroup.append("circle")
      .attr("id", "inner-circle")
      .attr("cx", this.center.x)
      .attr("cy", this.center.y)
      .attr("r", this.innerRadius)
      .attr("fill", "none")
      .attr("stroke", "black")
      .attr("stroke-width", 2);

    // create clusters
    const loclist = utilities.unique(this.data.map(d => d.location));
    const clusters = this.cluster(loclist);

    // get most per date & cluster
    const cluster_lut = clusters.map(d => new Set(d.locations.map(e => e.place_id)));
    const max_per_cluster_and_date = this.timeScale.domain_labels()
      .map(date => cluster_lut.map(cluster => this.data.filter(
        datum => cluster.has(datum.place_id) && this.timeScale.label(datum.Date) === date).length, this)
        .reduce((a, b) => Math.max(a, b), 0), this)
      .reduce((a, b) => Math.max(a, b), 1);
    const max_per_cluster = d3.max<number>(cluster_lut.map(cluster => this.data.filter(datum => cluster.has(datum.place_id)).length));

    const ref = this;
    // layout clusters
    return new Promise((resolve, reject) => {
      ref.dispatcher.addRestartListener(() => {
        reject('Layout cancelled.');
      });
      this.layoutClusters(clusters)
      .then(function(data: { clusters: Array<any>, scale: number, max_dist: number } | null) {
        if (data === null) {
          reject('Layout cancelled.');
        }
        const clusters = data.clusters;
        const scale = data.scale;
        const max_dist = data.max_dist;

        // create insets
        const place_id_to_inset = ref.createInsets(clusters, max_per_cluster_and_date, max_per_cluster);

        // create bars
        return ref.createBars(place_id_to_inset).then((errstate) => {
          if (errstate) {
            reject('Layout cancelled.');
          }
          // create splines
          ref.createSplines(max_per_cluster_and_date);

          // create isolines
          ref.createIsolines(scale, max_dist);
        });
      })
      .then(ref.onEndLayout.bind(ref))
      .then(() => resolve())
      .catch(console.error);
    });
  }

  private cluster(loclist: Array<any>): Array<any> {
    // get farthest distance between two locations
    const maxDistLocs = loclist.map(d =>
      loclist.map(e => utilities.greatCircleDistanceAndAngle(
        d.geometry.location,
        e.geometry.location,
        this.settings.projection).distance)
      .reduce((a,b) => Math.max(a,b), 0))
      .reduce((a,b) => Math.max(a,b), 0);

    // cluster by angle (max distance 0.5rad)
    const projection = this.settings.projection;

    // distance to cluster by is 5% of max distance
    const thresholds = [6, 10, 15, 20, 100].map(d => maxDistLocs/d);

    let clusters;
    for (let i = 0; i < thresholds.length; ++i) {
      const threshold = thresholds[i];
      // then by distance
      clusters =  hcluster(loclist, function(a, b) {
          return utilities.greatCircleDistanceAndAngle(
            a.geometry.location,
            b.geometry.location,
            projection
          ).distance;
        }, 'single', threshold)
        .tree
        .map(utilities.flattenTree);

      if (clusters.length > 1 || loclist.length <= 1) break;
    }

    return clusters.map(d => {
      const bbox = utilities.cartesianBoundingBox2(d);
      const center = { lat: (bbox.minLat + bbox.maxLat)/2, lng: (bbox.minLng + bbox.maxLng)/2 };
      return {
        locations: d,
        bbox,
        center,
        gca: utilities.greatCircleDistanceAndAngle(this.origin, center, this.settings.projection),
        name: this.createClusterName(d)
      };
    }, this);
  }

  private layoutClusters(clusters: Array<any>): Promise<any> {
    const cr = () => {
      switch (clusters.length) {
        case 1:
          return 300;
        case 2:
          return 250;
        case 3:
          return 200;
        case 4:
          return 150;
        default:
          return 100;
      }
    };
    const cluster_radius = cr();
    const outerRadius = Math.max(cluster_radius + 100, 200) + this.innerRadius;
    this.outerRadius = outerRadius;
    const max_dist = clusters.reduce((a,b) => Math.max(a, b.gca.distance), 0);
    const scale = (700 - cluster_radius) / max_dist;
    const ref = this;

    // create nodes and ghost nodes
    const real_nodes = clusters.map((d,i) => {
      const delta = outerRadius + scale * d.gca.distance;
      const x = Math.cos(d.gca.alpha) * delta;
      const y = Math.sin(d.gca.alpha) * delta;
      const radius = cluster_radius;
      const type = 'real';
      const id = 'real-' + i;
      return {
        delta, x, y, radius, type, id,
        gca: d.gca
      };
    });

    return new Promise((resolve, reject) => {
      ref.dispatcher.addRestartListener(() => {
        this._layoutInsets.onmessage = _ => {};
        reject('Layout cancelled.')
      });

      this._layoutInsets.onmessage = ({data}) => {
        data.clusters.forEach((d, i) => {
          const c = clusters[i];
          c.x = d.x;
          c.y = d.y;
          c.radius = d.radius;
          c.alpha = d.alpha;
        });
        resolve({clusters, max_dist: data.max_dist, scale: data.scale});
      };
      const data_to_send = {
        real_nodes,
        max_dist,
        cluster_radius,
        outerRadius,
        scale
      };
      this._layoutInsets.postMessage(data_to_send);
    });
  }

  private createInsets(clusters: Array<any>, most_per_date: number, most_per_cluster: number): Map<string, mapinset.MapInset> { // TODO
    const place_id_to_inset = new Map<string, mapinset.MapInset>();
    const root = this.insetGroup.node();
    this.lengthScaleInsets = d3.scaleLinear()
      .domain([0, most_per_date])
      .range([0, 50]);
    this.lengthScale = d3.scaleLinear()
      .domain([0, most_per_cluster])
      .range([0, 50]);

    clusters.forEach(cluster => {
      let m = new mapinset.MapInset(root, cluster.locations, { x: cluster.x, y: cluster.y }, 2*cluster.radius,
        this.data, this.dispatcher, this.colorScale, this.lengthScaleInsets, cluster.name, this.timeScale, cluster.alpha);
      m.gca = cluster.gca;
      cluster.locations.forEach(function(d: any) {
        place_id_to_inset.set(d.place_id, m);
      });
      this.insets.push(m);
    }, this);

    return place_id_to_inset;
  }

  private createBars(place_id_to_inset: Map<string, mapinset.MapInset>): Promise<void> {
    const ref = this;
    const in_arcs = ref.insets.map(d =>
      ref.data.filter(e =>
        place_id_to_inset.get(e.place_id) === d));
    const longest = in_arcs.reduce((a, b) => Math.max(a, b.length), 1);
    return new Promise((resolve, reject) => {
      ref.dispatcher.addRestartListener(() => reject('Layout cancelled.'));

      const nodes = ref.insets.map(d => {
        const pos = d.getCenter();
        let angle = Math.atan2(pos.y, pos.x);
        return {
          inset: d,
          x: angle,
          angle,
          y: 0,
          fy: 0
        };
      });

      d3.forceSimulation()
        .alphaDecay(1 - Math.pow(0.001, 1/20))
        .nodes(nodes)
        .force('f', d3.forceCollide()
          .strength(0.1)
          .radius(1.5 / 180 * Math.PI))
        .on('end', () => {
          nodes.forEach(d => {
            d.angle = d.x;
          });
          resolve(nodes)
        });
    }).then(function(nodes: Array<any>) {
      nodes.forEach((d, i) => {
        const angle = d.angle;
        const in_arc = in_arcs[i];

        // get center
        const x = Math.cos(angle) * ref.innerRadius + ref.center.x;
        const y = Math.sin(angle) * ref.innerRadius + ref.center.y;

        // maximum length of bar
        const max_len = ref.lengthScale(in_arc.length);

        // calculate average publication date for bar
        const avg_date = in_arc.map(d => d.Date.valueOf()).reduce((a,b)=>a+b, 0) / in_arc.length;
        const colorAlpha = ref.colorScale.scaleAlpha(new Date(avg_date), 0.3);
        const color = ref.colorScale.scale(new Date(avg_date));

        const hist_desc = d.inset.description();

        let hist = new HistogramBar(ref.histogramBars.node(), {x, y}, angle, max_len,
          colorAlpha, color, in_arc.length, ref.dispatcher, in_arc, hist_desc,
          {
            shape: 'arc',
            center: ref.center,
            innerRadius: ref.innerRadius,
            outerRadius: ref.innerRadius + ref.lengthScaleInsets(longest),
            startAngleDelta: -3 / 180 * Math.PI,
            endAngleDelta: 3 / 180 * Math.PI
          }
        );
        hist.setLineWidth(7);
        ref.bins.push(hist);
        ref.locations_for_bin.push({
          place_ids: Array.from(new Set(in_arc.map(d => d.place_id))),
          center: ref.center,
          angle: angle,
          radius: ref.innerRadius + max_len,
          index: i
        });
      }, ref);
    }).catch(err => { if (err !== undefined) console.error(err); });
  }

  private createClusterName(locs: Array<any>): string {
    const names = locs.map(d => d.formatted_address);
    if (locs.length < 4) return names.join("; ");
    return names[0] + "; ... (" + (names.length - 2) + "); " + names[names.length - 1];
  }

  // create a spline from each inset:date to each direction histogram bar
  private createSplines(max_count) {
    /**
     * This construct needs only be built in the beginning. the goal is to have
     * only one line from a direction histogram bar to a date histogram bar,
     * regardless of how many locations this line represents.
     */
    const max_width = 20;
    let mapping = new Map<HistogramBar, Map<HistogramBar, Array<string>>>();
    let inset_for_hist = new Map<HistogramBar, mapinset.MapInset>();
    let date_for_hist = new Map<HistogramBar, Date>();

    const uniqueDates = function(lst: Array<Date>) : Array<Date> {
      let uniq = [];
      new Set(lst.map(d=>d.getTime())).forEach(d=>uniq.push(new Date(d)));
      return uniq;
    };
    this.insets.forEach(function(inset: mapinset.MapInset) {
      inset.locations.forEach(function(location: any) {
        // find start histogram rect
        const startattr = this.locations_for_bin.filter(d =>
          d.place_ids.indexOf(location.place_id) != -1)[0];
        let starthist = this.bins[startattr.index];

        if (!mapping.has(starthist)) mapping.set(starthist, new Map<HistogramBar, Array<string>>());
        let innerMapping = mapping.get(starthist);

        let articles = inset.data.filter(d => d.place_id == location.place_id);
        // get dates
        let dates = uniqueDates(articles.map(d => d.Date));

        dates.forEach(function(date: Date) {
          let histbarEnd = inset.histogramForDate(date);
          inset_for_hist.set(histbarEnd, inset);
          date_for_hist.set(histbarEnd, date);

          if (!innerMapping.has(histbarEnd)) innerMapping.set(histbarEnd, [location.place_id]);
          else innerMapping.get(histbarEnd).push(location.place_id);
        }, this);
      }, this);

      inset.dateHistogramBars.forEach(function(hist: HistogramBar) {
        hist.notifyListeners();
      }, this);
    }, this);

    // now create lines
    mapping.forEach(function(innerMap: Map<HistogramBar, Array<string>>,
      sourceBar: HistogramBar) {
      innerMap.forEach(function(locations: Array<string>, destBar: HistogramBar) {
        const startpos = sourceBar.end;
        const endpos = destBar.end;
        const startangle = sourceBar.angle;
        const endangle = 0; // gets overridden immediately

        // create line
        let line_ = new linerender.ThickeningLine(this.lines, 1, 1,
          startpos, endpos, startangle, endangle);
        line_.setDateAndLocs(date_for_hist.get(destBar), locations);
        line_.setColorScale(this.colorScale);
        line_.setScale(max_width / max_count);
        // register a end point listener
        let inset = inset_for_hist.get(destBar);
        let listener = {
          line: line_,
          setPointAndAngle: function(end: utilities.Point, angle: number) {
            const end_ = {
              x: end.x + inset.getCenter().x,
              y: end.y + inset.getCenter().y
            };
            this.line.setValues({
              end: end_,
              endAngle: angle
            });
          }
        };
        destBar.registerEndListener(listener);
        this.dispatcher.addListener(line_);

        this.splines.push(line_);
      }, this);
    }, this);

    this.insets.forEach(d => d.recalculatePositionAttributes());
  }

  private onEndLayout() {
    this.dispatch.call('recenter-content');
  }

  private isolineRangeForDistance(dist: number) : { radii: Array<number>, extra: number } {
    const distance = dist/1000 * (this.settings.units === "metric" ? 1.0 : 1.609344);

    if (distance < 50) {
      return {
        radii: [ 0, 10, 20, 50 ],
        extra: 5
      };
    }
    if (distance < 200) {
      return {
        radii: [ 0, 20, 50, 100, 150, 200 ],
        extra: 50
      };
    }
    if (distance < 1000) {
      return {
        radii: [ 0, 50, 100, 200, 500, 1000 ],
        extra: 100
      };
    }
    if (distance < 5000) {
      return {
        radii: [ 0, 200, 500, 1000, 2000, 5000 ],
        extra: 500
      };
    }
    return {
      radii: [ 0, 1000, 2000, 5000, 10000, 15000 ],
      extra: 1000
    };
  }

  private createIsolines(scale: number,
    maxDist: number
  ) : void {
    let ref = this;
    const f = function(radius) {
      if (ref.settings.units == "imperial") {
        return {
          label: radius+"\u2009mi",
          radius: this.outerRadius + radius * 1609.344498 * scale
        };
      } else {
        return {
          label: radius+"\u2009km",
          radius: this.outerRadius + radius * 1000 * scale
        };
      }
    };

    const radii = this.isolineRangeForDistance(maxDist);
    const max_dist_all = Math.max(
      maxDist/1000,
      radii.radii.reduce((a,b) => Math.max(a,b), 0)
    );
    const labeled_radii = radii.radii.map(f, this);
    const extra_radii = Array.apply(null, {length: Math.floor(max_dist_all / radii.extra)})
      .map(Number.call, Number)
      .map(d => d * radii.extra)
      .filter(d => !radii.radii.includes(d))
      .map(f, this);

    let g = d3.select("svg#bg-map-svg")
      .select("g#outer-content-transform-group")
      .select("g#no-sideeffect-content");

    let line = d3.line();

    const offset_x = 0;

    labeled_radii.forEach(function(r) {
      this.createOneIsoline(g, r, offset_x, 40, 0.5, true);
    }, this);

    extra_radii.forEach(function(r) {
      this.createOneIsoline(g, r, offset_x, 60, 0.2, false);
    }, this);
  }

  private createOneIsoline(
    g: d3.Selection<SVGGElement, any, any, any>,
    radius: { label: string, radius: number },
    offset_x: number,
    labelOffsetPercent: number,
    strokeWidth: number,
    label: boolean) {
    const line = d3.line();

    let uniqueId1 = "isoline-path-left-" + radius.label;
    let uniqueId2 = "isoline-path-right-" + radius.label;
    let _g = g.append("g")
      .attr("id", "isoline-" + radius.label);
    // right arc
    _g.append("path")
      .attr("id", uniqueId1)
      .attr("d",
        "M " + (-offset_x) + "," + (radius.radius)
        + " A " + radius.radius + "," + radius.radius
        + ", 0, 1, 1, " + (-offset_x) + "," + (-radius.radius)
      );
    // right arc
    _g.append("path")
      .attr("id", uniqueId2)
      .attr("d",
        "M " + offset_x + "," + (-radius.radius)
        + " A " + radius.radius + "," + radius.radius
        + ", 0, 1, 1, " + offset_x + "," + radius.radius
      );

    // text label
    if (label) {
      _g.append("text")
        .append("textPath")
        .attr("xlink:href", "#"+uniqueId1)
        .style("text-anchor", "middle")
        .attr("startOffset", labelOffsetPercent + "%")
        .style("font-size", "16px")
        .style("fill", "#a0a0a0")
        .text(radius.label);
      _g.append("text")
        .append("textPath")
        .attr("xlink:href", "#"+uniqueId2)
        .style("text-anchor", "middle")
        .attr("startOffset", labelOffsetPercent + "%")
        .style("font-size", "16px")
        .style("fill", "#a0a0a0")
        .text(radius.label);
    }

    _g.selectAll("path")
      .attr("fill", "none")
      .attr("stroke", "grey")
      .attr("stroke-width", strokeWidth)
      .attr("stroke-opacity", 1);
  }
}
