'use strict';

import {greatCircleDistanceAndAngle, Coordinate} from './utilities';

interface Geolocation {
  continent: String;
  country: String;
  position: Coordinate;
};

function distance(a: Geolocation, b: Geolocation): Array<Number> {
  // calculate distance vector
  return [
    (a.continent == b.continent) ? 0 : 1,
    (a.country == b.country) ? 0 : 1,
    geoDistance(a.position, b.position)
  ];
}

function geoDistance(a: Coordinate, b: Coordinate): Number {
  return greatCircleDistanceAndAngle(a, b, 'equirectangular').distance;
}

export function testClustering(): void {
  
}
