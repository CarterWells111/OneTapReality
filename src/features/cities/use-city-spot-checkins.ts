import * as React from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalLibrary } from '../auth/local-library-provider';
import { listCitySpotCheckins, setCitySpotCheckin } from '../../storage/city-spot-checkin-repository';
import { getCityCheckinSpots } from './city-checkin-spots';

type Snapshot = { token: object; ids: string[]; ready: boolean; saving: boolean; error: string };
export function useCitySpotCheckins(city: string) {
  const db = useSQLiteContext();
  const { owner, isReady: libraryReady, runWrite } = useLocalLibrary();
  const [reload, setReload] = React.useState(0);
  // A fresh identity also invalidates same-owner session changes through runWrite.
  const token = React.useMemo(() => ({city,db,owner,libraryReady,runWrite,reload}), [city,db,owner,libraryReady,runWrite,reload]);
  const live = React.useRef<object | null>(token);
  live.current = token;
  const busy = React.useRef<object | null>(null);
  const [snapshot, setSnapshot] = React.useState<Snapshot>({token,ids:[],ready:false,saving:false,error:''});
  const current = snapshot.token === token ? snapshot : {token,ids:[],ready:false,saving:false,error:''};

  React.useEffect(() => {
    live.current = token;
    let cancelled = false;
    if (libraryReady) {
      const valid = new Set(getCityCheckinSpots(city).map(s => s.spotId));
      void listCitySpotCheckins(db,owner,city).then(rows => {
        if (!cancelled && live.current === token) setSnapshot({token,ids:rows.map(r => r.spotId).filter(id => valid.has(id)),ready:true,saving:false,error:''});
      }).catch(() => {
        if (!cancelled && live.current === token) setSnapshot({token,ids:[],ready:false,saving:false,error:'打卡记录读取失败，请重试'});
      });
    }
    return () => { cancelled = true; if (live.current === token) live.current = null; };
  },[city,db,owner,libraryReady,token]);

  const setVisited = async (spotId: string, visited: boolean): Promise<void> => {
    if (!current.ready || !libraryReady || busy.current) return;
    busy.current = token;
    setSnapshot(s => ({...s,saving:true,error:''}));
    try {
      await runWrite(async (activeOwner,assertActive) => {
        assertActive();
        if (live.current !== token || activeOwner !== owner) throw new Error('本机旅行册已经切换');
        await setCitySpotCheckin(db,activeOwner,city,spotId,visited);
        assertActive();
      });
      if (live.current === token) setSnapshot(s => ({...s,ids:visited ? [...new Set([...s.ids,spotId])] : s.ids.filter(id => id !== spotId),saving:false,error:''}));
    } catch {
      if (live.current === token) setSnapshot(s => ({...s,saving:false,error:'打卡保存失败，请重试'}));
    } finally { if (busy.current === token) busy.current = null; }
  };
  return {visitedSpotIds:current.ids,isReady:current.ready,isSaving:current.saving,error:current.error,setVisited,retry:()=>setReload(n=>n+1)};
}
