'use strict';

import * as d3 from 'd3';

interface Notifiable {
  notify(data: Array<any>) : void;
}

type NoArgumentCallback = () => void;

/**
 * The dispatcher will handle all brushing action. This way, it is centralized.
 */
export default class Dispatcher {
  // use the real deal inside
  private _dispatch: d3.Dispatch<any>;
  private _counter : number;
  private _restart: any;

  constructor() {
    this._dispatch = d3.dispatch<any>('brush', 'restart');
    this._counter = 1;
  }

  addListener(listener: Notifiable) {
    const id = 'brush.' + (this._counter++);
    this._dispatch.on(id, function(data: Array<any>) {
      listener.notify(data);
    });
  }

  addRestartListener(listener: NoArgumentCallback): void {
    const id = 'restart.' + (this._counter++);
    this._dispatch.on(id, listener);
  }

  dispatch(data: Array<any>) {
    console.time('brush');
    this._dispatch.call('brush', null, data);
    console.timeEnd('brush');

    // word cloud special treatment
    d3.select('g#wordcloud').selectAll('text').style('font-weight', 'normal');
  }

  restart(data: Array<any>, description: string) {
    this._dispatch.call('restart', null, data, description);
  }

  restartWithSelections(sel: d3.Selection<SVGElement, any, any, Array<any>>) {
    const data = this.dataFromSelection(sel);
    this.restart(data.data, data.description);
  }

  brushWithSelections(sel: d3.Selection<SVGElement, any, any, Array<any>>) {
    const data = this.dataFromSelection(sel);
    this.dispatch(data.data);

    // word cloud special treatment
    if (sel.classed('selected')) d3.select('g#wordcloud').selectAll('text.selected').style('font-weight', 'bold');
  }

  private dataFromSelection(sel: d3.Selection<SVGElement, any, any, Array<any>>)
    : {description: string, data: Array<any>}
  {
    // if part of selection, use that to select
    if (sel.classed("selected")) {
      const sel2 = d3.selectAll('.selected');
      // flat list
      let data : Array<any> = (sel2.data() as Array<Array<any>>)
        .reduce(function (a: Array<any>, b: Array<any>): Array<any> {
          return a.concat(b);
        }, []);

      let descriptions = sel2.nodes()
        .map(d3.select)
        .map(this.getDescriptionOfObject)
        .sort()
        .join("; ");

      // join data
      let indices = new Set();
      let list : Array<any> = [];
      data.forEach(function(datum : any) {
        if (!indices.has(datum.Index)) {
          indices.add(datum.Index);
          list.push(datum);
        }
      });
      return { data: list, description: descriptions };
    } else {
      return { data: sel.datum(), description: this.getDescriptionOfObject(sel) };
    }
  }

  setRestart(restart: any): void {
    this._dispatch.on('restart', restart);
  }

  private getDescriptionOfObject(sel: d3.Selection<SVGElement, any, any, any>): string {
    const desc = sel.attr('description');
    return desc || "unknown";
  }
}
