import { wgs, type P } from '../../../geo'
export const Z=14;export const BASE='https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0'
export const kachel=(lat:number,lon:number):[number,number]=>[Math.floor((lon+180)/360*2**Z),Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**Z)]
export const poiUrl=(p:P)=>{const [x,y]=kachel(...wgs(...p));return `${BASE}/${Z}/${x}/${y}.pbf`}
