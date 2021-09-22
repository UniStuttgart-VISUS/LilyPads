'use strict';

import * as d3 from 'd3';
import ColorScale from './color-scale';
import Dispatcher from './dispatcher';

export default class SmallMultiples {
  private root: d3.Selection<HTMLDivElement, any, any, any>;
  private data: Array<any>;
  private colorScale: ColorScale;
  private dispatcher: Dispatcher;

  private background: HTMLCanvasElement;
  private brushed: HTMLCanvasElement;
  private frame: HTMLCanvasElement;

  constructor(root: d3.Selection<HTMLDivElement, any, any, any>,
    data: Array<any>,
    colorScale: ColorScale,
    dispatcher: Dispatcher
  ) {
    this.root = root;
    this.data = data;
    this.colorScale = colorScale;
    this.dispatcher = dispatcher;
    this.dispatcher.addListener(this);

    this.initCanvases();
    this.assignToColors();
    this.drawMultiples();
    this.drawBrushedMultiples([]);
  }

  private initCanvases() {
    this.background = document.querySelector('div#small-multiples canvas#background');
    this.brushed = document.querySelector('div#small-multiples canvas#brushed');
    this.frame = document.querySelector('div#small-multiples canvas#frame');
  }

  private multiplesOrder: Map<string, number> = new Map<string, number>();
  private brushedMultiples: Set<string> = new Set<string>();
  private multiplesByColor: Map<string, string[]> = new Map<string, string[]>();

  private assignToColors() {
    this.data.forEach((datum, i) => {
      const color = this.colorScale.scale(datum.Date);
      if (this.multiplesByColor.has(color)) this.multiplesByColor.get(color).push(datum.Index);
      else this.multiplesByColor.set(color, [datum.Index]);

      this.multiplesOrder.set(datum.Index, i);
    });
  }

  private drawMultiples() {
    const {dim, num_x, width, height} = this.fitIntoRect();
    this.background.height = height;
    this.background.width = width;

    const ctx = this.background.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    this.multiplesByColor.forEach((multiples, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();

      multiples.forEach(multiple => {
        const index = this.multiplesOrder.get(multiple);
        ctx.rect(1 + (index % num_x) * dim, 1 + Math.floor(index / num_x) * dim, dim, dim);
      });

      ctx.fill();
    });
  }

  private drawBrushedMultiples(brushed_indices: {Index: string}[]) {
    const {dim, num_x, width, height} = this.fitIntoRect();
    this.brushed.height = height;
    this.brushed.width = width;

    const ctx = this.brushed.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.globalAlpha = 0.7;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 1;
    brushed_indices.forEach(({Index}) => {
      const index = this.multiplesOrder.get(Index);
      ctx.clearRect(1 + (index % num_x) * dim, 1 + Math.floor(index / num_x) * dim, dim, dim);
    });
  }

  updateVisible(visible: string[]) {
    const {dim, num_x, width, height} = this.fitIntoRect();
    this.frame.height = height;
    this.frame.width = width;

    if (visible.length === 0) return;

    const indices = visible.map(i => this.multiplesOrder.get(i));
    indices.sort((a,b) => a - b);


    const rects: [number, number, number, number][] = [];
    let last_i = indices[0];
    let x = 1 + (indices[0] % num_x) * dim;
    let y = 1 + Math.floor(indices[0] / num_x) * dim;
    let x2 = 1 + (indices[0] % num_x) * dim + dim;

    indices.forEach(i => {
      const y_new = 1 + Math.floor(i / num_x) * dim;
      const x_new = 1 + (i % num_x) * dim;
      if (y_new !== y || i > last_i+1) {
        // break rectangle
        rects.push([x, y, x2 - x, dim]);
        x = x_new;
        y = y_new;
      } 
      x2 = x_new + dim;
      last_i = i;
    });

    rects.push([x, y, x2-x, dim]);

    const ctx = this.frame.getContext('2d');
    ctx.fillStyle = 'none';
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 1;
    ctx.beginPath();
    rects.forEach(([x, y, w, h]: [number, number, number, number]) => {
      ctx.rect(x-1, y-1, w+2, h+2);
    });
    ctx.stroke();
  }

  notify(data: Array<{Index: string}>) {
    this.drawBrushedMultiples(data);
  }

  private fitIntoRect() : { dim: number, num_x: number, width: number, height: number } {
    this.root.style('height');
    this.root.style('width');
    const size = this.data.length;
    const {width, height} = this.root.node().getBoundingClientRect();

    const aspect = width / height;

    const area_per = ((width-2) * (height-2)) / size;
    const dim_temp = Math.floor(Math.sqrt(area_per));
    const num_x_pre = Math.floor((width-2) / dim_temp);
    const num_y_pre = Math.ceil(size / num_x_pre);

    // modify so it fits
    const dim = Math.min(dim_temp, Math.floor((height-2) / num_y_pre));
    const num_x = Math.floor((width-2) / dim);

    return {dim, num_x, width, height};
  }

  rearrange(newOrder: Map<string, number>): Promise<void> {
    this.multiplesOrder = newOrder;
    this.drawMultiples();
    return Promise.resolve();
  }
}
