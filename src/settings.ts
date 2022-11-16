'use strict';

import * as d3 from 'd3';
import * as L from 'leaflet';
import * as R from 'ramda';

export interface Settings {
  colour_scale: [string, string];
  neutral: string;
  create_gap: boolean;
  dataset: string;
  origin: L.LatLngLiteral;
  projection: 'greatcircle' | 'equirectangular';
  units: 'metric' | 'imperial';
};

export const default_settings: Settings = {
  colour_scale: ["#00dcd6", "#313aff"],
  neutral: "#0061b3",
  origin: {
    lat: 48,
    lng: 9
  },
  projection: "equirectangular",
  create_gap: false,
  units: "metric",
  dataset: "cs1_1"
};

const LILYPADS_SETTINGS_KEY = 'LilyPads.settings';

export function getSettings(): Promise<Settings> {
  return new Promise(resolve => {
    const settings_str = window.localStorage.getItem(LILYPADS_SETTINGS_KEY) || '{}';
    const settings = JSON.parse(settings_str);
    for (const key in default_settings) {
      if (!(key in settings)) settings[key] = default_settings[key];
    }

    // if dataset is set in URL fragment, take from there, save, clear fragment
    if (window.location.hash.length > 1) {
      settings.dataset = window.location.hash.replace('#', '');
      window.location.hash = '';
    }

    window.localStorage.setItem(LILYPADS_SETTINGS_KEY, JSON.stringify(settings));
    d3.select<HTMLInputElement, any>('input#col1').node().value = settings.colour_scale[0];
    d3.select<HTMLInputElement, any>('input#col2').node().value = settings.colour_scale[1];
    d3.select<HTMLSelectElement, any>('select#projection-input').node().value = settings.projection;
    d3.select<HTMLSelectElement, any>('select#units-input').node().value = settings.units;
    d3.select<HTMLLinkElement, any>('a#dataset-change-link').attr('href', `./change_dataset?current=${settings.dataset}`);
    setLatStr(L.latLng(settings.origin.lat, settings.origin.lng));

    resolve(settings as Settings);
  });
}

function setSettingsInternal(settings: {}) : Promise<any> {
  return new Promise((resolve, reject) => {
    const s = JSON.parse(window.localStorage.getItem(LILYPADS_SETTINGS_KEY) || '{}');

    for (const key in settings) {
      if (!(key in default_settings)) reject(new Error(`No such key in settings: '${key}'`));
      s[key] = settings[key];
    }

    window.localStorage.setItem(LILYPADS_SETTINGS_KEY, JSON.stringify(s));
    resolve(void 0);
  });
}

export function setSettings(settings: {}) : Promise<any> {
  return setSettingsInternal(settings)
  .then(function() {
    return getSettings();
  });
}

export function onSettingsChangedReload() : any {
  let start = (d3.select('input#col1') as d3.Selection<HTMLInputElement, any, any, any>).node().value;
  let end = (d3.select('input#col2') as d3.Selection<HTMLInputElement, any, any, any>).node().value;

  let latlng = (d3.select('span.origin__coordinates') as d3.Selection<HTMLSpanElement, L.LatLng, any, any>).datum();

  let projection = (d3.select('select#projection-input') as d3.Selection<HTMLSelectElement, any, any, any>).node().value;

  let units = (d3.select('select#units-input') as d3.Selection<HTMLSelectElement, any, any, any>).node().value;

  return {
    colour_scale: [ start, end ],
    origin: {
      lat: latlng.lat,
      lng: latlng.lng
    },
    projection: projection,
    units: units
  };
}

export function onScaleChange(): void {
  let start = (d3.select('input#col1') as d3.Selection<HTMLInputElement, any, any, any>).node().value;
  let end = (d3.select('input#col2') as d3.Selection<HTMLInputElement, any, any, any>).node().value;

  let svg = d3.select('svg#gradient');
  svg.selectAll('*').remove();

  const interpolator = d3.interpolateHsl(start, end);

  const width = parseInt(svg.style('width'));
  const xdata = Array.from(R.range(0,Math.floor(width)));

  (svg.selectAll('rect')
    .data(xdata) as d3.Selection<SVGRectElement, number, any, any>)
    .enter()
    .append('rect')
    .attr('x', d => d)
    .attr('y', 0)
    .attr('width', 1)
    .attr('height', 30)
    .attr('fill', d => d3.color(interpolator(d/xdata.length)).hex());
}

function setLatStr(ll: L.LatLng): void {
  (d3.select('span.origin__coordinates') as d3.Selection<HTMLSpanElement, L.LatLng, any, any>)
    .datum(ll)
    .text(function(datum: L.LatLng): string {
      const ns = datum.lat > 0 ? "N" : "S";
      const ew = datum.lng > 0 ? "E" : "W";

      const lat = Math.abs(datum.lat);
      const lng = Math.abs(datum.lng);

      // format
      let s = ns + " " + (Math.floor(lat)) + "° " + ((lat % 1) * 60).toFixed(2) + "', "
        + ew + " " + (Math.floor(lng)) + "° " + ((lng % 1) * 60).toFixed(2) + "'";

      return s;
    });
}

export function initMap(settings, restart_cb, reset_cb): void {
  let lat = settings.origin.lat;
  let lng = settings.origin.lng;
  let latlng = L.latLng(lat, lng);

  setLatStr(latlng);

  let proj = settings.projection;
  (d3.select('select#projection-input') as d3.Selection<HTMLSelectElement, any, any, any>).node().value = proj;

  let units = settings.units || "metric";
  (d3.select('select#units-input') as d3.Selection<HTMLSelectElement, any, any, any>).node().value = units;

  // map
  let m = d3.select('div#origin-map-div') as d3.Selection<HTMLDivElement, any, any, any>;
  let map = L.map('origin-map-div', {attributionControl: false}).setView(latlng, 0);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  })
    .addTo(map);

  let marker = L.marker(latlng);
  marker.addTo(map);

  m.datum(marker);

  map.on('click', function(evt: L.LeafletMouseEvent) {
    // get
    const loc = evt.latlng.wrap();
    this.setView(loc, this.getZoom());
    setLatStr(loc);
    setSettings({ origin: loc })
      .then(_ => restart_cb());

    // move marker
    marker.setLatLng(loc);
  });

  d3.select('.modal-background')
    .on('click', function(event) {
      if (event && event.target === this) {
        reset_cb();
      }
    });
}
