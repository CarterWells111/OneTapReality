import { checkinMapImageSize, type CityCheckinSpot } from './city-checkin-spots';
export type MapFrame = { x: number; y: number; width: number; height: number };
export function containMapFrame(width: number, height: number): MapFrame {
  const scale = Math.max(0,Math.min(width/checkinMapImageSize.width,height/checkinMapImageSize.height));
  const w = checkinMapImageSize.width*scale, h = checkinMapImageSize.height*scale;
  return { x:(width-w)/2,y:(height-h)/2,width:w,height:h };
}
export function projectCitySpot(spot: CityCheckinSpot, frame: MapFrame) {
  return { x:frame.x+spot.marker.x*frame.width,y:frame.y+spot.marker.y*frame.height,hitSize:44 };
}
export function hitTestCitySpot(spots: readonly CityCheckinSpot[], frame: MapFrame, x: number, y: number): CityCheckinSpot | null {
  if (!frame.width || !frame.height) return null;
  const ranked = spots.map(spot => {
    const p = projectCitySpot(spot,frame);
    const distance = Math.hypot(x-p.x,y-p.y);
    const r = spot.label;
    const nx=(x-frame.x)/frame.width, ny=(y-frame.y)/frame.height;
    const label = r.width > 0 && r.height > 0 && nx >= r.x && nx <= r.x+r.width && ny >= r.y && ny <= r.y+r.height;
    const marker = Math.abs(x-p.x) <= p.hitSize/2 && Math.abs(y-p.y) <= p.hitSize/2;
    return {spot,distance,label,marker};
  });
  // Exact names take precedence over adjacent enlarged targets. Marker overlaps
  // otherwise choose the nearest painted dot, independent of render order.
  const names = ranked.filter(r => r.label);
  return (names.length ? names : ranked.filter(r => r.marker)).sort((a,b) => a.distance-b.distance)[0]?.spot ?? null;
}
