'use strict';

import * as d3 from 'd3';
import * as d3tile from 'd3-tile';
import * as L from 'leaflet';
import * as utilities from './utilities';
import HistogramBar from './histogram-bar';
import Dispatcher from './dispatcher';
import ColorScale from './color-scale';
import TimeScale from './time-scale';
import { oneSplinePerDirectionAndInset } from './constants';

export class MapInset {
  // members
  locations:              Array<any>;     // TODO: location interface
  center:                 utilities.Point;
  radius:                 number;
  totalGroup:             d3.Selection<SVGGElement, any, any, any>;
  mapGroup:               d3.Selection<SVGGElement, any, any, any>;
  markers:                Array<any>;
  map:                    L.Map;
  gca:                    utilities.AngleAndDistance;

  // mapping from time in ms (Date.getTime)
  dateHistogramBars:      Map<string, HistogramBar>;
  angleForHistogramBar:   Map<HistogramBar, number>;

  data:                   Array<any>;
  local_data:             Array<any>;

  dispatch:               d3.Dispatch<any>;
  dispatcher:             Dispatcher;
  colorScale:             ColorScale;
  timeScale:              TimeScale;

  distance:               number;
  scale:                  d3.ScaleLinear<number, number>;
  alpha:                  number;

  private description_string: string;

  private _afterMoveCallbacks : Array<( (point: utilities.Point, angle: number) => void )> = [];

  constructor(root : Element,
    loclist : Array<any>,
    center : utilities.Point,
    radius : number,
    data : Array<any>,
    dispatcher: Dispatcher,
    colorScale: ColorScale,
    scale: d3.ScaleLinear<number, number>,
    description: string,
    timeScale: TimeScale,
    alpha: number
  ) {
    this.locations = loclist;
    this.center = center;
    // TODO: this is the diameter
    this.radius = loclist.length === 1 ? 200 : radius;
    this.data = data;
    this.dispatcher = dispatcher;
    this.dispatcher.addListener(this);

    this.colorScale = colorScale;
    this.scale = scale;
    this.timeScale = timeScale;

    this.alpha = alpha;
    this.description_string = description;

    const ids = this.locations.map(d => d.place_id);
    this.local_data = data.filter(function(d: any) {
      return ids.includes(d.place_id);
    }, this);

    this.initialize(root, description);
  }

  description(): string {
    return this.description_string;
  }

  onMove(callback: ((p: utilities.Point, a: number) => void)) {
    this._afterMoveCallbacks.push(callback);
  }

  initialize(root: Element, description: string) {
    const id_str = this.locations.map(d=>d.place_id).join(":");
    this.totalGroup = (d3.select(root)
      .append("g")) as d3.Selection<SVGGElement, any, any, any>;
    this.totalGroup
      .attr("class", "map-inset-root")
      .attr("id", id_str)
      .attr("transform", "translate(" + this.center.x + ","
        + this.center.y + ")");

    // bind data directly to component
    this.totalGroup.datum(this.local_data)
      .attr('description', description);

    const title = Array.from(new Set(this.local_data.map(d => d.location.formatted_address))).join('\n');
    this.totalGroup.append('title')
      .text(title);

    this.totalGroup
      .append("circle")
      .attr("cx", -this.radius/2 + 5).attr("cy", -this.radius/2 + 5).attr("r", 5)
      .attr("fill", "none")
      .classed("bounding-box", true);

    let background = this.totalGroup.append('clipPath')
      .attr('id', 'clip-' + id_str)
      .append("circle")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", this.radius/2)
      .attr("fill", "white");

    this.mapGroup = this.totalGroup.append('g')
      .attr('clip-path', 'url(#clip-' + id_str + ')')
      .classed('map-inset__map-layer', true) as d3.Selection<SVGGElement, any, any, any>;

    if (this.locations.length === 1) {
      this.createSvgMap(this.mapGroup, true);
      this.createLabel(this.mapGroup, this.locations[0].formatted_address);
    } else {
      this.createSvgMap(this.mapGroup, false);
    }

    let ref = this;
    this.totalGroup.on("mouseenter", function() {
      ref.dispatcher.dispatch(ref.local_data);
    }).on("mouseleave", function() {
      ref.dispatcher.dispatch([]);
    }).on("click", function(event) {
      if (event.button == 0) {
        ref.dispatcher.restartWithSelections(ref.totalGroup);
      }
    }).on('contextmenu', function(event) {
      event.preventDefault();
      ref.totalGroup.classed("selected", !ref.totalGroup.classed("selected"));
    });

    this.createOuterRim();
  }

  private createLabel(parent: d3.Selection<SVGGElement, any, any, any>, label: string) {
    const r = parent.append('rect')
      .attr('width', this.radius)
      .attr('height', this.radius/4)
      .attr('x', -this.radius/2)
      .attr('y', this.radius/4)
      .style('fill', 'DarkGray')
      .attr('title', label);

    parent.append('text')
      .attr('x', 0)
      .attr('y', this.radius * 3 / 8 - 10)
      .attr('font-size', 16)
      .attr('text-anchor', 'middle')
      .attr('fill', 'white')
      .attr('font-family', 'sans-serif')
      .text(label.split(',')[0]);
  }

  createSvgMap(dom_node : d3.Selection<SVGGElement, any, any, any>, is_single_location) {
    const locs = this.locations;
    const h = this.radius;
    const w = this.radius;

    // bounds
    const geojson = {
      type: 'FeatureCollection',
      features: this.locations.map(d => {
        return {
          type: 'Feature',
          properties: d,
          geometry: {
            type: 'Point',
            coordinates: [ d.geometry.location.lng, d.geometry.location.lat ]
          }
        };
      })
    } as d3.ExtendedFeatureCollection;
    const projection = d3.geoMercator();
    const r = this.radius / 2;
    const r_delta = (1 - Math.SQRT1_2 + 0.05) * r;

    if (is_single_location) {
      const scale = 256 * 2**3;
      const center: [number, number] = [
        this.locations[0].geometry.location.lng,
        this.locations[0].geometry.location.lat
      ];
      projection.scale(scale);
      projection.translate([0,0]);
      const translate = projection(center).map(d => -d) as [number, number];
      translate[1] -= r/4;
      projection.translate(translate);
    } else {
      projection.fitExtent([[-r + r_delta, -r + r_delta],[r - r_delta, r - r_delta]], geojson);
    }

    // background
    dom_node.append('circle')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', h/2)
      .attr('fill', 'white')
      .classed('bounding-box', true);

    // tiles
    const url = ([x, y, z]: [number, number, number]) => {
      return `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`;
    };
    const tiles = (<any>(d3tile.tile()))
      .clampX(false)
      .scale(projection.scale() * 2*Math.PI)
      .translate(projection([0,0]))
      .extent([[-r, -r], [r,r]])
    ();

    const img = dom_node.selectAll('image').data(tiles) as d3.Selection<SVGImageElement, [number, number, number], any, any>;
    img.enter()
      .append('image')
      .attr("xlink:href", d => url(d3tile.tileWrap(d) as [number, number, number]))
      .attr("x", ([x]) => (x + tiles.translate[0]) * tiles.scale)
      .attr("y", ([, y]) => (y + tiles.translate[1]) * tiles.scale)
      .attr("width", tiles.scale + 1)
      .attr("height", tiles.scale + 1);

    // add icons
    dom_node.selectAll('.dummy')
      .data(geojson.features.map((d: any) => {
        const proj = projection(d.geometry.coordinates) as any;
        proj.id = d.properties.place_id;
        return proj;
      }))
      .enter()
      .append('circle')
      .attr('r', 5)
      .attr('cx', d=> d[0])
      .attr('cy', d => d[1])
      .classed('location-marker', true);

    // this.map = mymap;
  }

  /**
   * Move to new center.
   */
  move(center) {
    this.center = center;
    this.totalGroup
      .attr("transform", "translate(" 
        + this.center.x + ","
        + this.center.y + ")");

    this.recalculatePositionAttributes();
  }

  recalculatePositionAttributes() {
    // realign histogram bars
    const angleToCenter = Math.atan2(this.center.y, this.center.x) + Math.PI;
    const angleBasis = oneSplinePerDirectionAndInset ? Math.PI : angleToCenter;
    this.dateHistogramBars.forEach(function(value: HistogramBar) {
      const angleDiff = this.angleForHistogramBar.get(value);
      const angle = angleDiff + angleBasis;
      const radius = this.radius/2;

      const start = {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
      };
      value.setStartAndAngle(start, angle, this.center);
    }, this);

    this._afterMoveCallbacks.forEach(d => d(this.center, angleToCenter + Math.PI));
  }

  /**
   * Brush this node and all locations in it which are contained in the
   * place_ids.
   */
  brush(ids: Array<number>) {
    this.totalGroup.select(".leaflet-map-div")
    this.mapGroup.classed('map-inset__map-layer--linked', true);
    (this.totalGroup.selectAll('.location-marker') as d3.Selection<SVGCircleElement, {id: number}, any, any>)
      .classed('location-marker--linked', d => ids.includes(d.id));
  }

  unbrush() {
    this.mapGroup.classed('map-inset__map-layer--linked', false);
    this.totalGroup.selectAll('.location-marker')
      .classed('location-marker--linked', false);
  }

  /**
   * Add outer rim. The outer rim contains a date histogram for the dates.
   */
  createOuterRim() {
    this.dateHistogramBars = new Map<string, HistogramBar>();
    this.angleForHistogramBar = new Map<HistogramBar, number>();

    const radius = this.radius/2;

    // face the center
    const beginAngle = this.alpha;

    /*
     * Maximum extent is +- PI/4.
     * Maximum bar width is 5px.
     * If less bars than (PI * r / 4) / 5px needed, adjust extent accordingly.
     */
    const max_extent = Math.PI/2;
    const max_bar_width = 10;

    const bars_extent = 1/1.2 // paddingInner
      * max_bar_width
      * this.timeScale.domain_labels().length
      / radius;
    const extent = Math.min(max_extent, bars_extent);

    // create angle scale
    const angleScale = d3.scaleBand()
      .domain(this.timeScale.domain_labels())
      .range([-extent/2, extent/2])
      .paddingInner(0.2)
      .paddingOuter(0.2);

    const local = this.local_data;
    this.timeScale.domain_labels().forEach(function(date: string, i: number) {
      const dataForDate = local.filter(function(datum: any) {
        return date === this.timeScale.label(datum.Date);
      }, this);

      if (dataForDate.length === 0) return;

      const diff = angleScale(date);
      const angle = beginAngle + diff;
      const date_ = this.timeScale.invert(date);
      let hist = new HistogramBar(this.totalGroup.node(),
        {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        }, angle, this.scale(dataForDate.length),
        this.colorScale.scaleAlpha(date_, 0.3), this.colorScale.scale(date_),
        dataForDate.length,
        this.dispatcher,
        dataForDate,
        date + '@' + this.totalGroup.attr('description'),
        {
          shape: 'arc',
          center: this.center,
          innerRadius: radius,
          outerRadius: radius + this.scale.range()[1],
          startAngleDelta: -angleScale.step() / 2,
          endAngleDelta: angleScale.step() / 2
        }
      );
      hist.setLineWidth(
        Math.min(max_bar_width, this.radius / 2 * angleScale.bandwidth())
      );

      this.dateHistogramBars.set(date, hist);
      this.angleForHistogramBar.set(hist, diff);
    }, this);

    // create selection marker
    const indicator_offset = 2/180*Math.PI;
    const arc = d3.arc()
      .innerRadius(this.radius/2)
      .outerRadius(this.radius/2 + 2)
      .startAngle(angleScale.range()[1] + beginAngle + Math.PI/2 - angleScale.bandwidth() + indicator_offset)
      .endAngle(angleScale.range()[0] + beginAngle + 2.5*Math.PI - angleScale.bandwidth());
    this.totalGroup.append('path')
      .classed('selection-marker', true)
      .attr('fill', 'red')
      .attr('d', arc);

    // create readability indicators
    const line = d3.line<[number, number]>();
    const arrow_tip_offset_px = 5;
    const arrow_tip_offset = arrow_tip_offset_px / (0.5 * this.radius + 50);
    const indicator_data = [
      [
        // start
        [
          Math.cos(angleScale.range()[0] - indicator_offset + beginAngle) * this.radius/2,
          Math.sin(angleScale.range()[0] - indicator_offset + beginAngle) * this.radius/2
        ],
        [
          Math.cos(angleScale.range()[0] - indicator_offset + beginAngle) * (this.radius/2 + 50),
          Math.sin(angleScale.range()[0] - indicator_offset + beginAngle) * (this.radius/2 + 50)
        ]
      ],
      // end
      [
        [
          Math.cos(angleScale.range()[1] + indicator_offset - angleScale.bandwidth() + beginAngle) * this.radius/2,
          Math.sin(angleScale.range()[1] + indicator_offset - angleScale.bandwidth() + beginAngle) * this.radius/2
        ],
        [
          Math.cos(angleScale.range()[1] + indicator_offset - angleScale.bandwidth() + beginAngle) * (this.radius/2 + 50),
          Math.sin(angleScale.range()[1] + indicator_offset - angleScale.bandwidth() + beginAngle) * (this.radius/2 + 50)
        ]
      ],
      // arrow
      [
        [
          Math.cos(angleScale.range()[0] - 1.1*indicator_offset -arrow_tip_offset + beginAngle) * (this.radius/2 + 50),
          Math.sin(angleScale.range()[0] - 1.1*indicator_offset -arrow_tip_offset + beginAngle) * (this.radius/2 + 50)
        ],
        [
          Math.cos(angleScale.range()[0] - 1.1*indicator_offset -arrow_tip_offset + beginAngle) * (this.radius/2 + 60),
          Math.sin(angleScale.range()[0] - 1.1*indicator_offset -arrow_tip_offset + beginAngle) * (this.radius/2 + 60)
        ],
        [
          Math.cos(angleScale.range()[0] - 1.1*indicator_offset + beginAngle) * (this.radius/2 + 55),
          Math.sin(angleScale.range()[0] - 1.1*indicator_offset + beginAngle) * (this.radius/2 + 55)
        ]
      ]
    ];

    let sel: d3.Selection<SVGPathElement, [number, number][], any, any> = this.totalGroup.selectAll<SVGPathElement, [number, number][]>('.readability-indicator')
      .data(indicator_data as Array<Array<[number, number]>>);
    sel.enter()
      .append('path')
      .classed('readability-indicator', true)
      .classed('bounding-box', true)
      .merge(sel)
      .attr('d', line)
      .attr('stroke', 'DarkGray')
      .attr('opacity', 0.7)
      .attr('stroke-width', 1)
      .attr('fill', 'DarkGray');
    sel.exit().remove();
  }

  histogramForDate(date: Date) : HistogramBar {
    if (this.dateHistogramBars.has(this.timeScale.label(date))) {
      return this.dateHistogramBars.get(this.timeScale.label(date));
    } else {
      console.log("Not found:", date, this.dateHistogramBars);
    }
  }

  getCenter() {
    return this.center;
  }

  notify(data: Array<any>) {
    const place_ids = data.map(d => d.place_id);
    // if any data in this, brush, else, unbrush
    let ids = this.locations.map(d=>d.place_id);
    for (let idx in place_ids) {
      let id = place_ids[idx];
      // we can break from a standard loop
      if (ids.includes(id)) {
        this.brush(place_ids);
        return;
      }
    }
    this.unbrush();
  }

  setDistance(dist: number) {
    this.distance = dist;
  }
}
