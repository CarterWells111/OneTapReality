import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { cityContent } from '../../features/cities/city-content';
import { CityCheckinMap } from '../../features/cities/city-checkin-map';
import { getCityCheckinMapImage } from '../../features/cities/city-checkin-map-images';
import { resolveCityRouteParam } from '../../features/cities/city-route';
import { useCitySpotCheckins } from '../../features/cities/use-city-spot-checkins';

export default function CityCheckinMapScreen() {
  const router=useRouter();
  const params=useLocalSearchParams<{city?:string}>();
  const city=resolveCityRouteParam(typeof params.city==='string'?params.city:undefined);
  const source=getCityCheckinMapImage(city);
  const checkins=useCitySpotCheckins(city);
  React.useEffect(()=>{if(!source)router.replace(`/city/${city}` as never);},[city,router,source]);
  if(!source)return null;
  return <CityCheckinMap key={city} city={city} name={cityContent[city].name} source={source} checkins={checkins}
    onClose={()=>router.back()} onCityAlbums={()=>router.push(`/city/${city}` as never)}
    onNewAlbum={()=>router.push(`/memory/new?city=${city}` as never)}/>;
}
