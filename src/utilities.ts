'use strict';

import * as d3 from 'd3';
import * as L from 'leaflet';

  export interface Coordinate {
    lat: number;
    lng: number;
  }

  export interface CoordinateBoundingBox {
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  }

  interface Rectangle {
    top: number;
    bottom: number;
    left: number;
    right: number;
  }

  interface Rectangle2 {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface AngleAndDistance {
    alpha: number;
    distance: number;
  }

  export interface Point {
    x: number;
    y: number;
  }

  const useGreatCircle = false;

  function centerOfDOMElement(element : HTMLElement) : Point {
    const rect = element.getBoundingClientRect();
    let x = rect.left + rect.width/2;
    let y = rect.top + rect.height/2;
    return {x:x, y:y};
  }

  export function inRange(val : number, min : number, max : number) : boolean {
    return (val >= min) && (val <= max);
  }

  function intersects(rect1 : Rectangle2, rect2 : Rectangle2) : boolean {
    let xOverlap = inRange(rect1.x, rect2.x, rect2.x + rect2.width)
      || inRange(rect2.x, rect1.x, rect1.x + rect1.width);
    let yOverlap = inRange(rect1.y, rect2.y, rect2.y + rect2.height)
      || inRange(rect2.y, rect1.y, rect1.y + rect1.height);
    return xOverlap && yOverlap;
  }

  function rad2deg(rad : number) : number {
    return rad * 180.0 / Math.PI;
  }

  function deg2rad(deg : number) : number {
    return deg * Math.PI / 180.0;
  }

export function greatCircleDistanceAndAngle(origin: Coordinate,
  dest: Coordinate,
  projection: string) : AngleAndDistance {
    if (origin == undefined) console.trace();
    const R = 6371e3; // metres
    const phi1 = deg2rad(origin.lat);
    const phi2 = deg2rad(dest.lat);
    const lambda1 = deg2rad(origin.lng);
    const lambda2 = deg2rad(dest.lng);
    const delta_phi = deg2rad(dest.lat-origin.lat);
    const delta_lambda = deg2rad(dest.lng-origin.lng);

    if (projection === 'greatcircle') {
      // forward azimuth
      const y = Math.sin(lambda2-lambda1) * Math.cos(phi2);
      const x = Math.cos(phi1)*Math.sin(phi2) -
        Math.sin(phi1)*Math.cos(phi2)*Math.cos(lambda2-lambda1);
      const brng = Math.atan2(y, x) - Math.PI/2;

      const a = Math.sin(delta_phi/2) * Math.sin(delta_phi/2) +
        Math.cos(phi1) * Math.cos(phi2) *
        Math.sin(delta_lambda/2) * Math.sin(delta_lambda/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

      const distance = R * c;


      return { alpha: brng, distance: distance };
    } else if (projection === 'equirectangular') {
      let dl = delta_lambda;
      while (dl <= -2*Math.PI) dl += 2*Math.PI;
      while (dl >= 2*Math.PI) dl -= 2*Math.PI;
      let delta_lambda_2;
      if (Math.abs(dl) > 2*Math.PI - Math.abs(dl)) {
        delta_lambda_2 = dl;
      } else {
        delta_lambda_2 = (2*Math.PI - Math.abs(dl)) * (-1) * Math.sign(dl);
      }
      const alpha2 = Math.atan2(
        -delta_phi,
        -delta_lambda_2
      );
      const d2 = L.CRS.EPSG4326.distance(origin, dest);

      return { alpha: alpha2, distance: d2 };
    } else {
      console.error('Unknown projection type: ', projection);
    }
  }

  function rectangleWithinOther(inner: Rectangle, outer: Rectangle) : boolean {
    return ((inner.top >= outer.top)
      && (inner.bottom <= outer.bottom)
      && (inner.left >= outer.left)
      && (inner.right <= outer.right));
  }

  export function geojson2Point(json : any) : L.LatLng {
    return L.latLng(json.lat, json.lng);
  }

  export function cartesianBoundingBox2(locations: Array<any>): CoordinateBoundingBox {
    const coords = [];
    locations.forEach(d => {
      coords.push(d.geometry.location);
      if (d.geometry.bounds) {
        coords.push(d.geometry.bounds.northeast);
        coords.push(d.geometry.bounds.southwest);
      }
    });
    return cartesianBoundingBox(coords);
  }

  export function cartesianBoundingBox(coords : Array<Coordinate>) : CoordinateBoundingBox {
    let bbox = {
      minLng: Number.POSITIVE_INFINITY,
      minLat: Number.POSITIVE_INFINITY,
      maxLng: Number.NEGATIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY
    };
    return coords.reduce(function(prev,coord) {
      return {
        minLng: Math.min(coord.lng, prev.minLng),
        minLat: Math.min(coord.lat, prev.minLat),
        maxLng: Math.max(coord.lng, prev.maxLng),
        maxLat: Math.max(coord.lat, prev.maxLat)
      };
    }, bbox);
  }

  function nodeSimilarity(node1 : any, node2 : any) : number {
    // vector of distances in different dimensions
    let distanceVector = [];

    // location "distance"
    if (node1.place_id == node2.place_id) distanceVector.push(0);
    else distanceVector.push(100);

    // date distance (in days)
    let dateDist = Math.abs(node1.Date.getTime() - node2.Date.getTime())/86400000;
    distanceVector.push(dateDist);

    // similarity measure: most similar dimension counts
    return distanceVector.reduce((a,b) => Math.min(a,b), Infinity);
  }

  export function flattenTree(node : any) : any {
    if (node.value) return [ node.value ];
    else {
      let l = flattenTree(node.left);
      let r = flattenTree(node.right);
      return l.concat(r);
    }
  }

export function unique(list : Array<any>) : Array<any> {
  let uniq = [];
  new Set(list).forEach(d => uniq.push(d));
  return uniq;
}
