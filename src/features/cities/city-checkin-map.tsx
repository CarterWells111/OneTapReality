import * as React from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton, bodyFont, colors, serifFont } from '../../components/ui';
import { containMapFrame, hitTestCitySpot, projectCitySpot } from './city-checkin-geometry';
import { getCityCheckinSpots, type CityCheckinSpot } from './city-checkin-spots';
import type { useCitySpotCheckins } from './use-city-spot-checkins';

export function CityCheckinMap({city,name,source,checkins,onClose,onCityAlbums,onNewAlbum}: {
  city:string; name:string; source:ImageSourcePropType;
  checkins:ReturnType<typeof useCitySpotCheckins>;
  onClose:()=>void; onCityAlbums:()=>void; onNewAlbum:()=>void;
}) {
  const insets=useSafeAreaInsets();
  const spots=getCityCheckinSpots(city);
  const [size,setSize]=React.useState({width:0,height:0});
  const frame=containMapFrame(size.width,size.height);
  const [panel,setPanel]=React.useState<'help'|'list'|CityCheckinSpot|null>(null);
  const visited=new Set(checkins.visitedSpotIds);
  const count=spots.filter(s=>visited.has(s.spotId)).length;
  const selected=typeof panel==='object' ? panel : null;
  const dismiss=()=>setPanel(null);
  const navigate=(action:()=>void)=>{dismiss();action();};
  return (
    <View style={[styles.screen,{paddingTop:insets.top,paddingBottom:insets.bottom}]} testID="city-checkin-map-screen">
      <View style={styles.header} testID="city-checkin-map-header">
        <View style={{flex:1}}><Text style={styles.title}>{name}</Text><Text style={styles.subtitle}>城市打卡地图</Text></View>
        <Pressable accessibilityLabel="打卡地图帮助" accessibilityRole="button" style={styles.iconButton} onPress={()=>setPanel('help')}><Text style={styles.icon}>?</Text></Pressable>
        <Pressable accessibilityLabel="关闭打卡地图" accessibilityRole="button" style={styles.iconButton} onPress={onClose} testID="city-checkin-map-close"><Text style={styles.icon}>✕</Text></Pressable>
      </View>
      <View style={styles.progress}>
        <Text accessibilityLiveRegion="polite" style={styles.body}>{checkins.isReady ? `已打卡 ${count} / ${spots.length}` : '正在读取打卡记录…'}</Text>
        <Text style={styles.small}>记录你的城市足迹</Text>
      </View>
      <View style={styles.canvas} testID="city-checkin-map-canvas"
        onLayout={e=>setSize({width:e.nativeEvent.layout.width,height:e.nativeEvent.layout.height})}
        onStartShouldSetResponder={()=>true}
        onResponderRelease={e=>{const s=hitTestCitySpot(spots,frame,e.nativeEvent.locationX,e.nativeEvent.locationY);if(s)setPanel(s);}}
      >
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image accessibilityLabel={`${name}城市打卡地图`} resizeMode="contain" source={source} style={[StyleSheet.absoluteFill,{width:'100%',height:'100%'}]} testID="city-checkin-map-image" />
        </View>
        <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {spots.filter(s=>visited.has(s.spotId)).map(s=>{const p=projectCitySpot(s,frame);return <View key={s.spotId} style={[styles.check,{left:p.x+6,top:p.y-22}]} testID={`checkin-${s.spotId}`}><Text style={styles.checkText}>✓</Text></View>;})}
        </View>
      </View>
      {!!checkins.error && <View style={styles.errorRow}><Text accessibilityRole="alert" style={styles.error}>{checkins.error}</Text>{!checkins.isReady && <AppButton label="重试读取" onPress={checkins.retry} tone="secondary"/>}</View>}
      <Pressable accessibilityLabel="查看景点列表" accessibilityRole="button" style={styles.footer} onPress={()=>setPanel('list')}><Text style={styles.body}>点击圆点或名称打卡 · 景点列表 ›</Text></Pressable>
      <Modal transparent visible={panel!==null} animationType="fade" onRequestClose={dismiss}>
        <View style={[styles.backdrop,{paddingTop:insets.top+16,paddingBottom:insets.bottom+16}]}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.sheetHeader}>
              <Text accessibilityRole="header" style={[styles.title,{fontSize:24,flex:1}]}>{panel==='help' ? '怎样使用打卡地图' : panel==='list' ? `${name}景点` : selected?.name}</Text>
              <Pressable accessibilityLabel={panel==='help' ? '关闭帮助' : panel==='list' ? '关闭景点列表' : '关闭景点详情'} accessibilityRole="button" style={styles.iconButton} onPress={dismiss}><Text style={styles.icon}>✕</Text></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetBody}>
              {panel==='help' ? <>
                <Text style={styles.body}>这是一张城市足迹手绘地图。点击地图上的圆点或景点名称，打开详情后选择“标记已到访”。小屏幕也可以从景点列表选择。</Text>
                <Text style={styles.body}>已到访的景点显示勾选，顶部显示打卡进度；再次打开详情，选择“取消打卡”即可撤销。</Text>
                <Text style={styles.body}>记录保存在本机，按当前访客或账号分别保存。更换设备不会自动同步；访客记录可以在登录时迁移到账号。</Text>
                <Text style={styles.body}>打卡独立于相册，不会自动创建相册。详情中可查看城市相册或新建相册；删除或清空旅行册保留打卡记录，删除账号会清除该账号的本机打卡。</Text>
              </> : panel==='list' ? spots.map(s=>(
                <Pressable key={s.spotId} accessibilityRole="button" accessibilityLabel={`${s.number ? `${s.number} ` : ''}${s.name}，${visited.has(s.spotId)?'已打卡':'未打卡'}`} style={styles.listItem} onPress={()=>setPanel(s)}>
                  <Text style={styles.body}>{s.number ? `${s.number}  ` : ''}{s.name}</Text><Text style={styles.small}>{visited.has(s.spotId)?'✓ 已打卡':'未打卡'} ›</Text>
                </Pressable>
              )) : selected ? <>
                <Text style={styles.body}>{visited.has(selected.spotId)?'✓ 已到访':'还没有记录到访'}</Text>
                <AppButton label={checkins.isSaving?'正在保存…':visited.has(selected.spotId)?'取消打卡':'标记已到访'} disabled={!checkins.isReady||checkins.isSaving} onPress={()=>{void checkins.setVisited(selected.spotId,!visited.has(selected.spotId));}}/>
                {!!checkins.error && <Text accessibilityRole="alert" style={styles.error}>{checkins.error}</Text>}
                <AppButton label="查看城市相册" tone="secondary" onPress={()=>navigate(onCityAlbums)}/>
                <AppButton label="新建相册" tone="secondary" onPress={()=>navigate(onNewAlbum)}/>
              </> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.background},
  header:{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingTop:12,paddingBottom:8,gap:8},
  title:{color:colors.ink,fontFamily:serifFont,fontSize:28},
  subtitle:{color:colors.accent,fontFamily:bodyFont,fontSize:13,letterSpacing:2},
  iconButton:{width:44,height:44,borderRadius:22,borderWidth:1,borderColor:colors.line,alignItems:'center',justifyContent:'center'},
  icon:{fontSize:20,color:colors.ink},
  progress:{paddingHorizontal:20,paddingBottom:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:4},
  body:{fontFamily:bodyFont,fontSize:16,color:colors.ink,lineHeight:25},
  small:{fontFamily:bodyFont,fontSize:12,color:colors.muted,lineHeight:20},
  canvas:{flex:1,overflow:'hidden'},
  check:{position:'absolute',width:22,height:22,borderRadius:11,backgroundColor:colors.muted,borderWidth:2,borderColor:colors.background,alignItems:'center',justifyContent:'center'},
  checkText:{color:colors.background,fontSize:14,fontWeight:'800'},
  footer:{minHeight:48,alignItems:'center',justifyContent:'center',paddingHorizontal:12,borderTopWidth:1,borderColor:colors.line},
  errorRow:{paddingHorizontal:20,gap:8},error:{color:colors.danger,fontFamily:bodyFont,fontSize:14},
  backdrop:{flex:1,justifyContent:'center',paddingHorizontal:20,backgroundColor:'rgba(47,42,38,0.45)'},
  sheet:{maxHeight:'100%',width:'100%',maxWidth:520,alignSelf:'center',borderRadius:24,backgroundColor:colors.background,overflow:'hidden'},
  sheetHeader:{flexDirection:'row',alignItems:'center',padding:18,gap:8,borderBottomWidth:1,borderColor:colors.line},
  sheetBody:{padding:20,gap:16},
  listItem:{minHeight:48,paddingVertical:8,borderBottomWidth:1,borderColor:colors.line,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
});
