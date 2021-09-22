'use strict';

import * as d3 from 'd3';

interface Reducer {
  scale: number;
  operator: (Date) => string;
  invert: (string) => Date;
};

const date_to_label: Array<Reducer> = [
  {
    scale: 1,
    operator: d3.timeFormat('%Y-%m-%d'),
    invert: d3.timeParse('%Y-%m-%d')
  },
  {
    scale: 7,
    // ISO 8601 week handling logic
    operator: (d: Date) => {
      const w = d3.timeFormat('%V')(d);
      const y = d3.timeFormat('%Y')(d);
      const m = d.getMonth();
      if (m === 11 /* December */ && w === '01') {
        // week 1 begins in december
        return '' + (d.getFullYear()+1) + ' W' + w;
      }

      if (m === 0 /* January */ && parseInt(w, 10) > 5) {
        // week 52/53 goes into January
        return '' + (d.getFullYear()-1) + ' W' + w;
      }

      return y + ' W' + w;
    },
    invert: d3.timeParse('%Y W%V')
  },
  {
    scale: 30.436667,
    operator: d3.timeFormat('%b %Y'),
    invert: d3.timeParse('%b %Y')
  },
  {
    scale: 91.31,
    operator: d => {
      const q = Math.floor(d.getMonth() / 3) + 1;
      return 'Q' + q + ' ' + d.getFullYear();
    },
    invert: s => {
      const re = s.match(/Q(\d+) (\d+)/);
      return new Date(parseInt(re[2]), (parseInt(re[1])-1) * 3, 1);
    }
  },
  {
    scale: 365.24,
    operator: d3.timeFormat('%Y'),
    invert: d3.timeParse('%Y')
  }
];

export default class TimeScale {
  private start: Date;
  private end: Date;
  private max_steps: number;

  private reducer: Reducer;

  constructor(start: Date, end: Date, max_steps: number) {
    this.start = start;
    this.end = end;
    this.max_steps = max_steps;

    this.calc();
  }

  private calc() {
    const number_days = Math.round((this.end.getTime() - this.start.getTime()) / 86400000 + 1);
    // find first aggregation that fits into less than max_steps categories
    let idx = 0;
    const check = i => Math.ceil(number_days / date_to_label[i].scale) <= this.max_steps;
    while (!check(idx)) ++idx;
    this.reducer = date_to_label[idx];
  }

  range(): [Date, Date] {
    return [this.start, this.end];
  }

  scale(): number {
    return this.reducer.scale;
  }

  domain_labels(): Array<string> {
    const domain = [ this.reducer.operator(this.start) ];
    let date = this.start;
    while (date.getTime() <= this.end.getTime()) {
      const d = this.reducer.operator(date);
      if (d !== domain[domain.length - 1]) domain.push(d);
      date = new Date(date.getTime() + 86400000);
    }
    return domain;
  }

  domain(): Array<Date> {
    return this.domain_labels().map(this.reducer.invert);
  }

  label(d: Date): string {
    return this.reducer.operator(d);
  }

  invert(s: string): Date {
    return this.reducer.invert(s);
  }
};
