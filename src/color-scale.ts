'use strict';

import * as d3 from 'd3';

/**
 * Scales from a Date range to a color range.
 */
export default class ColorScale {
  private _scale:           d3.ScaleLinear<number, number>;
  private _interpolator:    ((t: number) => string);
  private _neutral:         string;

  constructor(domain: [Date, Date],
    range: [string, string],
    neutral_: string) {
    this._scale = d3.scaleLinear<number, number>()
      .domain(domain.map(d => d.getTime()))
      .range([0,1]);
    this._interpolator = d3.interpolateHsl(range[0], range[1]);
    this._neutral = neutral_;
  }

  // scaling
  scale(date: Date) : string {
    return d3.color(this._interpolator(this._scale(date.getTime()))).hex();
  }

  // scaling with reduced saturation
  scaleGreyed(date: Date) : string {
    let color = d3.hsl(this.scale(date));
    color.s = 0.3;

    return color.hex();
  }

  scaleAlpha(date: Date, opacity: number) : string {
    let color = d3.rgb(this.scale(date));
    color.opacity = opacity;
    return color + "";
  }

  // get a neutral color (for radial histogram)
  neutral() : string {
    return this._neutral;
  }
}
