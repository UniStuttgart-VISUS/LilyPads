'use strict';

import * as d3 from 'd3';

import ColorScale from './color-scale';
import Dispatcher from './dispatcher';

// for Spanish-American War dataset: language bar shows countries, not languages
const __flag_mapping_saw = {
  'Austria-Hungary': 'historical/austria_hungary',
  Finland: 'fi',
  France: 'fr',
  Germany: 'de',
  'Great Britain': 'gb',
  Mexico: 'mx',
  Netherlands: 'nl',
  Spain: 'es',
  USA: 'us'
};

const __language_codes_saw = {
  'Austria-Hungary': 'a-h',
  Finland: 'fin',
  France: 'fra',
  Germany: 'deu',
  'Great Britain': 'gb',
  Mexico: 'mex',
  Netherlands: 'nld',
  Spain: 'esp',
  USA: 'usa'
};

const flag_mapping = {
  English: 'gb',
  Dutch: 'nl',
  German: 'de',
  Swedish: 'se',
  Spanish: 'es',
  Finnish: 'fi',
  French: 'fr',
  Welsh: 'gb-wls',
  Italian: 'it',
  Polish: 'pl',

  ...__flag_mapping_saw
};
const language_codes_iso_639_3 = {
  English: 'eng',
  Dutch: 'nld',
  German: 'deu',
  Swedish: 'swe',
  Spanish: 'spa',
  Finnish: 'fin',
  French: 'fra',
  Welsh: 'cym',
  Italian: 'ita',
  Polish: 'pol',

  ...__language_codes_saw
};

export default class LanguageBar {
  private _svg: d3.Selection<SVGSVGElement, any, any, any>;
  private _scale: ColorScale;
  private _scale_width: d3.ScaleLinear<number, number>;
  private _dispatcher: Dispatcher;

  private _min_value: number = 0;
  private _total_count_per_language: Map<string, number> = new Map<string, number>();
  private _link_path_boundaries: Map<string, any> = new Map<string, any>();

  constructor(countPerLanguage: Array<any>, scale: ColorScale, dispatcher: Dispatcher) {
    this._scale = scale;
    this._dispatcher = dispatcher;

    this._dispatcher.addListener({
      notify: this.linkData.bind(this)
    });

    this._svg = d3.select('.language-selection__svg');
    this._svg.attr('shape-rendering', 'geometricPrecision');

    console.log(countPerLanguage);

    this.init(countPerLanguage);
  }

  private generatePathFragment(x00, x01, y0, x10, x11, y1, percentage): string {
    const x0 = d3.scaleLinear().domain([0,1]).range([x00, x01]);
    const x1 = d3.scaleLinear().domain([0,1]).range([x10, x11]);
    return `M ${x00},${y0} L ${x0(percentage)},${y0} ${x1(percentage)},${y1} ${x10},${y1} Z`;
  }

  private init(countPerLanguage: Array<any>): void {
    const svg_padding = 3;
    const content_padding = 2;
    const width = this._svg.node().getBoundingClientRect().width;
    const content_width = width - svg_padding * 2;
    const start_x = content_padding;
    const end_x = content_width - start_x - content_padding;
    const height = 110;
    const language_height = 10;

    this._svg.selectAll('*').remove();

    this._svg.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', content_width)
      .attr('height', height)
      .attr('fill', 'white')
      .classed('background', true);

    // BARS
    const bar_height = 20;

    const counts = countPerLanguage
      .sort((a,b) => {
        if (b.value === a.value) {
          const a_key = language_codes_iso_639_3[a.key];
          const b_key = language_codes_iso_639_3[b.key];
          return (a_key < b_key) ? -1 : 1;
        } else {
          return b.value - a.value;
        }
      });
    counts.forEach(d => {
      this._total_count_per_language.set(d.key, d.value);
    });
    const total = counts.reduce((a,b) => a + b.value, 0);
    const min_width = 5; // px
    const gap = 5; // px
    const min_value = Math.ceil(min_width * total / width);
    this._min_value = min_value;
    let offset = 0;
    counts.forEach(count => {
      count.offset = offset;
      count.display_value = Math.max(min_value, count.value);
      offset += count.display_value + gap;

      count.average_date = d3.sum(count.data.map(d => d.Date.valueOf())) / count.value;
    });

    const x = d3.scaleLinear()
      .domain([0,offset - gap])
      .range([start_x, end_x]);
    const x_length = d3.scaleLinear()
      .domain(x.domain())
      .range([0, content_width]);
    this._scale_width = x_length;

    // FLAGS
    const flag_width = 45; // px
    const flag_aspect = 3/2;
    const flag_gap = 5;
    let offset2 = 0;
    counts.forEach(count => {
      count.flag_offset = offset2;
      count.flag_image = flag_mapping[count.key];
      offset2 += flag_width + flag_gap;
    });
    offset2 -= flag_gap;
    const width_larger = width > offset2;

    const x2 = d3.scaleLinear()
      .domain([0, offset2])
      .range(width_larger
        ? [start_x + content_width - offset2, end_x]
        : [start_x, end_x]);

    // CONNECTIONS
    counts.forEach(d => {
      const flag_pos = d.flag_offset;
      const flag_x0 = x2(flag_pos);
      const flag_dx = x2(flag_pos + flag_width) - x2(flag_pos);
      const flag_x1 = flag_x0 + flag_dx;
      const flag_bottom_y = 1 + flag_dx / flag_aspect + language_height;

      const bar_top_y = height - bar_height;
      const bar_x0 = x(d.offset);
      const bar_x1 = x(d.offset + d.display_value);

      const x00 = flag_x0;
      const x01 = flag_x1;
      const y0 = flag_bottom_y + 2;
      const x10 = bar_x0;
      const x11 = bar_x1;
      const y1 = bar_top_y - 2;

      const area = 'M ' + flag_x0 + ',' + (flag_bottom_y + 2)
        + ' L ' + bar_x0 + ',' + (bar_top_y - 2)
        + ' L ' + bar_x1 + ',' + (bar_top_y - 2)
        + ' L ' + flag_x1 + ',' + (flag_bottom_y + 2)
        + 'Z';

      const path = 'M ' + flag_x0 + ',' + (flag_bottom_y + 2)
        + ' L ' + bar_x0 + ',' + (bar_top_y - 2)
        + ' M ' + bar_x1 + ',' + (bar_top_y - 2)
        + ' L ' + flag_x1 + ',' + (flag_bottom_y + 2);

      const filled_area = {
        x00, x01, y0, x10, x11, y1
      };

      const dummy_area = 'M ' + flag_x0 + ',' + (flag_bottom_y)
        + ' L ' + bar_x0 + ',' + (bar_top_y)
        + ' L ' + bar_x1 + ',' + (bar_top_y)
        + ' L ' + flag_x1 + ',' + (flag_bottom_y)
        + 'Z';

      d.connection_path = path;
      d.connection_area = area;
      d.filled_area = filled_area;
      d.dummy_area = dummy_area;
    });

    const ref = this;
    (this._svg.selectAll('.language')
      .data(counts) as d3.Selection<SVGGElement, any, any, any>)
      .enter()
      .append('g')
      .classed('language', true)
      .attr('description', d => d.key)
      .each(function(d: any) {
        const sel = d3.select(this);
        sel.datum(d.data);

        sel.append('rect')
          .classed('histogram-bar--total', true)
          .attr('x', x(d.offset))
          .attr('y', height - bar_height)
          .attr('height', bar_height)
          .attr('width', x(d.display_value + d.offset) - x(d.offset))
          .attr('fill', ref._scale.scaleAlpha(new Date(d.average_date), 0.3));

        sel.append('rect')
          .classed('histogram-bar--linked', true)
          .attr('x', x(d.offset))
          .attr('y', height - bar_height)
          .attr('height', bar_height)
          .attr('width', 0)
          .attr('fill', ref._scale.scale(new Date(d.average_date)));

        const img_x = x2(d.flag_offset);
        const img_y = 1 + language_height;
        const img_w = x2(d.flag_offset + flag_width) - x2(d.flag_offset);
        const img_h = (x2(d.flag_offset + flag_width) - x2(d.flag_offset)) / flag_aspect;

        sel.append('rect')
          .attr('x', img_x - 1)
          .attr('y', img_y - 1)
          .attr('width', img_w + 2)
          .attr('height', img_h + 2)
          .attr('fill', 'none')
          .attr('stroke', 'red')
          .attr('stroke-width', 2)
          .classed('selection-marker', true);

        sel.append('text')
          .classed('language__identifier-iso-639-3', true)
          .attr('x', img_x)
          .attr('y', language_height - 2)
          .text(language_codes_iso_639_3[d.key]);

        sel.append('image')
          .classed('flag', true)
          .classed('flag--inactive', true)
          .attr('x', img_x)
          .attr('y', img_y)
          .attr('width', img_w)
          .attr('height', img_h)
          .attr('preserveAspectRatio', 'none')
          .attr('xlink:href', `./app/images/flags/${d.flag_image}.svg`)

        sel.append('path')
          .classed('connection-path--area', true)
          .attr('fill', '#555')
          .attr('fill-opacity', 0.2)
          .attr('d', d.connection_area);

        const f = d.filled_area;
        const linked = sel.append('path')
          .classed('connection-path--linked-area', true)
          .attr('fill', ref._scale.scale(new Date(d.average_date)))
          .attr('fill-opacity', 0.5)
          .attr('d', ref.generatePathFragment(f.x00, f.x01, f.y0, f.x10, f.x11, f.y1, 0));
        ref._link_path_boundaries.set(d.key, f);

        sel.append('path')
          .classed('connection-path--lines', true)
          .attr('stroke', '#555')
          .attr('stroke-width', 0.5)
          .attr('d', d.connection_path);

        sel.append('path')
          .classed('connection-path--dummy-area', true)
          .attr('stroke', 'none')
          .attr('fill-opacity', 0)
          .attr('d', d.dummy_area);

        sel.append('title')
          .text(`${d.key}: ${d.value} article${d.value !== 1 ? 's' : ''}`);
      })
      .on('click', function(event, d) {
        if (event.button == 0) {
          ref._dispatcher.restartWithSelections(d3.select(this) as d3.Selection<SVGGElement, any, any, any>);
        }
      })
      .on('contextmenu', function(event) {
        event.preventDefault();
        const t = d3.select(this);
        t.classed('selected', !t.classed('selected'));
      })
      .on('mouseenter', function(_, d) {
        ref._dispatcher.brushWithSelections(d3.select(this) as d3.Selection<SVGGElement, any, any, any>);
      })
      .on('mouseleave', function(_, d) {
        ref._dispatcher.dispatch([]);
      });
  }

  private linkData(data: Array<any>): void {
    const ref = this;
    (this._svg.selectAll('.language') as d3.Selection<SVGGElement, any, any, any>)
    .each(function() {
      const t = d3.select(this);
      const language = t.attr('description');
      const data_for_this = data.filter(e => e.Language === language);
      const count = data_for_this.length;
      const len = (count === 0) ? 0 : Math.max(ref._min_value, count);
      const percentage = len / Math.max(ref._total_count_per_language.get(language), ref._min_value);
      const boundaries = ref._link_path_boundaries.get(language);
      const average_date: number = d3.sum(data_for_this.map(d => d.Date)) / count;

      t.select('.histogram-bar--linked')
        .transition()
        .attr('width', ref._scale_width(len));
      t.select('.flag')
        .classed('flag--inactive', count === 0);

      const tran = t.select('.connection-path--linked-area')
        .transition();
      tran.attr('d', ref.generatePathFragment(boundaries.x00, boundaries.x01, boundaries.y0, boundaries.x10, boundaries.x11, boundaries.y1, percentage));
      if (count > 0) {
        tran.attr('fill', ref._scale.scale(new Date(average_date)));
      }
    });
  }
};
