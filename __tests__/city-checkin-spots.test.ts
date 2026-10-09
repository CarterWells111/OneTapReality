import { cityCheckinSpots, getCityCheckinSpots } from '../src/features/cities/city-checkin-spots';
import { containMapFrame, hitTestCitySpot, projectCitySpot } from '../src/features/cities/city-checkin-geometry';
import { getCityCheckinMapImage } from '../src/features/cities/city-checkin-map-images';

it('covers all ten original maps, with unique stable IDs and exact original numbering', () => {
  expect(Object.keys(cityCheckinSpots).sort()).toEqual(['beijing','shanghai','chengdu','hangzhou','guangzhou','xian','wuhan','shenzhen','changsha','chongqing'].sort());
  for (const [city, spots] of Object.entries(cityCheckinSpots)) {
    expect(getCityCheckinMapImage(city)).toBeTruthy();
    expect(spots).toHaveLength(9);
    expect(new Set(spots.map(s => s.spotId)).size).toBe(9);
    expect(spots.map(s => s.number)).toEqual(city === 'wuhan' ? Array(9).fill(null) : [1,2,3,4,5,6,7,8,9]);
    for (const s of spots) {
      expect(s.name).toBeTruthy();
      for (const value of [s.marker.x,s.marker.y,s.label.x,s.label.y,s.label.width,s.label.height]) {
        expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1);
      }
    }
  }
  expect(getCityCheckinSpots('lhasa')).toEqual([]);
});

it.each([[390,650],[320,480],[844,270],[700,900]])('hits dots and names inside contain at %sx%s, excluding letterbox', (width,height) => {
  const frame = containMapFrame(width,height);
  for (const spots of Object.values(cityCheckinSpots)) {
    for (const spot of spots) {
      const p = projectCitySpot(spot, frame);
      expect(p.hitSize).toBeGreaterThanOrEqual(44);
      expect(hitTestCitySpot(spots,frame,p.x,p.y)?.spotId).toBe(spot.spotId);
      const x=frame.x+(spot.label.x+spot.label.width/2)*frame.width;
      const y=frame.y+(spot.label.y+spot.label.height/2)*frame.height;
      expect(hitTestCitySpot(spots,frame,x,y)?.spotId).toBe(spot.spotId);
    }
  }
  if(frame.x>0) expect(hitTestCitySpot(getCityCheckinSpots('beijing'),frame,0,height/2)).toBeNull();
  if(frame.y>0) expect(hitTestCitySpot(getCityCheckinSpots('beijing'),frame,width/2,0)).toBeNull();
});

it('resolves overlapping touch targets to the nearest marker', () => {
  const spot=getCityCheckinSpots('shanghai')[0];
  const other={...spot,spotId:'nearby',marker:{x:spot.marker.x+.01,y:spot.marker.y},label:{x:0,y:0,width:0,height:0}};
  const frame=containMapFrame(390,650);
  const p=projectCitySpot(other,frame);
  expect(hitTestCitySpot([spot,other],frame,p.x,p.y)?.spotId).toBe('nearby');
});
