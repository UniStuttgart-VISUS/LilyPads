'use strict';

import * as d3_ from 'd3';
import VisualisationHandler from './visualisation';

let v = new VisualisationHandler();
v.launch().then(function() {
  // update SVG in settings
  v.onChange();

  // create map
  v.createMap();
})
  .catch(console.error);

// necessary to get v from HTML calls
export function get(): VisualisationHandler {
  return v;
}

export const d3 = d3_;
