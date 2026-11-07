import L from 'leaflet'

/** Leaflet kennt den Kartenrand nicht: Ein Tooltip nahe am Rand würde abgeschnitten. Darum schiebt dieses Modul jeden Tooltip
 *  nach dem Positionieren ganz in die Karte. Es genügt, es einmal zu importieren. Feste Beschriftungen bleiben bei ihrem Objekt. */
export interface Kasten { left: number; right: number; top: number; bottom: number }
const ABSTAND_PX = 4
const achse = (von: number, bis: number, min: number, max: number) =>
  von < min + ABSTAND_PX ? min + ABSTAND_PX - von : bis > max - ABSTAND_PX ? max - ABSTAND_PX - bis : 0
export const randVerschiebung = (tip: Kasten, feld: Kasten): [number, number] =>
  [achse(tip.left, tip.right, feld.left, feld.right), achse(tip.top, tip.bottom, feld.top, feld.bottom)]

type Positionierbar = { _setPosition(pos: L.Point): void; _map: L.Map; _container: HTMLElement; options: L.TooltipOptions }
const tooltip = L.Tooltip.prototype as unknown as Positionierbar
const leafletPosition = tooltip._setPosition
tooltip._setPosition = function (this: Positionierbar, pos: L.Point) {
  leafletPosition.call(this, pos)
  this._container.classList.toggle('tooltip-fest', !!this.options.permanent)
  if (this.options.permanent) return
  const [dx, dy] = randVerschiebung(this._container.getBoundingClientRect(), this._map.getContainer().getBoundingClientRect())
  const verschoben = dx !== 0 || dy !== 0
  // Der Pfeil zeigte sonst neben das Objekt
  this._container.classList.toggle('tooltip-verschoben', verschoben)
  if (verschoben) L.DomUtil.setPosition(this._container, L.DomUtil.getPosition(this._container).add([dx, dy]))
}
