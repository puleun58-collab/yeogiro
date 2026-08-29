(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.YeogiroWeather=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DAY=/^\d{4}-\d{2}-\d{2}$/;
  const number=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
  const coordinate=value=>{
    if(!value||typeof value!=='object')return null;
    const lat=number(value.lat??value.latitude),lng=number(value.lng??value.lon??value.longitude);
    return lat!==null&&lng!==null&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180?{lat,lng}:null;
  };
  const dateOf=value=>typeof value==='string'?value.slice(0,10):typeof value?.date==='string'?value.date.slice(0,10):'';
  const minuteOf=value=>{
    const match=String(value??'').match(/(?:T|\s|^)(\d{2}):(\d{2})(?:$|:)/);
    if(!match)return null;
    const hour=Number(match[1]),minute=Number(match[2]);
    return hour<24&&minute<60?hour*60+minute:null;
  };
  const valueOf=(object,...names)=>{
    for(const name of names)if(object&&object[name]!==undefined&&object[name]!==null){const value=number(object[name]);if(value!==null)return value}
    return null;
  };
  function resolveDayLocations(trip,day){
    if(!trip||!DAY.test(day||''))return[];
    const points=(trip.items||[]).filter(item=>item?.day===day).map(coordinate).filter(Boolean);
    if(points.length){
      const locations=[];
      for(const point of points){
        if(locations.some(location=>Math.abs(location.lat-point.lat)<.01&&Math.abs(location.lng-point.lng)<.01))continue;
        locations.push(point);
      }
      if(locations.length<=2)return locations;
      let farthest=locations[1],distance=-1;
      for(const point of locations.slice(1)){const candidate=(point.lat-locations[0].lat)**2+(point.lng-locations[0].lng)**2;if(candidate>distance){distance=candidate;farthest=point}}
      return[locations[0],farthest];
    }
    const lodging=(trip.lodgings||[]).find(value=>{
      const checkIn=value?.checkInDate||value?.start||'',checkOut=value?.checkOutDate||value?.end||checkIn;
      return checkIn<=day&&(day<checkOut||checkIn===checkOut&&day===checkIn)&&coordinate(value);
    });
    if(lodging)return[coordinate(lodging)];
    const start=trip.start||trip.startDate||'',index=DAY.test(start)&&start<=day?Math.round((Date.UTC(...day.split('-').map((x,i)=>i===1?Number(x)-1:Number(x)))-Date.UTC(...start.split('-').map((x,i)=>i===1?Number(x)-1:Number(x))))/86400000):-1;
    const inRange=index>=0&&(trip.end?day<=trip.end:index<(trip.cities?.length||0)),city=inRange?(trip.cities?.[index]||trip.cities?.[trip.cities.length-1]):'';
    return typeof city==='string'&&city.trim()?[city.trim()]:[];
  }
  function nearestHourly(hours,time){
    const target=minuteOf(time);if(target===null||!Array.isArray(hours))return null;
    let closest=null,difference=Infinity;
    for(const hour of hours){const minute=minuteOf(hour?.time??hour?.dateTime);if(minute===null)continue;const candidate=Math.abs(minute-target);if(candidate<difference){closest=hour;difference=candidate}}
    return closest;
  }
  function weatherCode(code){
    const value=number(code),table={0:['맑음','☀️'],1:['대체로 맑음','🌤️'],2:['구름 조금','⛅'],3:['흐림','☁️'],45:['안개','🌫️'],48:['착빙 안개','🌫️'],51:['약한 이슬비','🌦️'],53:['이슬비','🌦️'],55:['강한 이슬비','🌧️'],56:['어는 이슬비','🧊'],57:['강한 어는 이슬비','🧊'],61:['약한 비','🌦️'],63:['비','🌧️'],65:['강한 비','🌧️'],66:['어는 비','🧊'],67:['강한 어는 비','🧊'],71:['약한 눈','🌨️'],73:['눈','🌨️'],75:['강한 눈','🌨️'],77:['눈 알갱이','🌨️'],80:['약한 소나기','🌦️'],81:['소나기','🌧️'],82:['강한 소나기','🌧️'],85:['약한 눈 소나기','🌨️'],86:['강한 눈 소나기','🌨️'],95:['뇌우','⛈️'],96:['우박을 동반한 뇌우','⛈️'],99:['강한 우박 뇌우','⛈️']},entry=table[value]||['알 수 없음','❔'];
    return{code:value,label:entry[0],icon:entry[1]};
  }
  function dailyAdvice(day,hours=[]){
    if(!day||typeof day!=='object')return[];
    const advice=[],precipitationProbability=valueOf(day,'precipitationProbabilityMax','precipitation_probability_max'),precipitationSum=valueOf(day,'precipitationSum','precipitation_sum'),apparent=valueOf(day,'apparentTemperatureMax','apparent_temperature_max','apparentTemperature'),wind=valueOf(day,'windSpeedMax','wind_speed_10m_max','windSpeed');
    if((precipitationProbability??0)>0||(precipitationSum??0)>0){
      const wet=(hours||[]).find(hour=>(valueOf(hour,'precipitation','rain')??0)>0||(valueOf(hour,'precipitationProbability','precipitation_probability')??0)>=40||[51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(valueOf(hour,'weatherCode','weather_code')));
      const time=wet&&String(wet.time||wet.dateTime||'').match(/(\d{2}:\d{2})/);
      advice.push({type:'precipitation',text:time?`${time[1]} 전후 비가 예상돼요. 우산을 챙기세요.`:'비가 예상돼요. 우산을 챙기세요.'});
    }
    if((apparent??-Infinity)>=33)advice.push({type:'heat',text:`체감온도가 ${Math.round(apparent)}°C까지 올라갈 수 있어요. 더위를 피하세요.`});
    if((wind??-Infinity)>=35)advice.push({type:'wind',text:`바람이 ${Math.round(wind)}km/h까지 강해질 수 있어요. 야외 활동에 유의하세요.`});
    return advice.slice(0,2);
  }
  function normalizeForecast(response){
    response=response&&typeof response==='object'?response:{};
    const daily=response.daily&&typeof response.daily==='object'?response.daily:{},hourly=response.hourly&&typeof response.hourly==='object'?response.hourly:{},current=response.current&&typeof response.current==='object'?response.current:{};
    const at=(source,names,index)=>{for(const name of names)if(Array.isArray(source[name]))return source[name][index]??null;return null};
    const normalizedDaily=(daily.time||[]).map((time,index)=>({date:typeof time==='string'?time.slice(0,10):null,temperatureMax:number(at(daily,['temperature_2m_max','temperatureMax'],index)),temperatureMin:number(at(daily,['temperature_2m_min','temperatureMin'],index)),apparentTemperatureMax:number(at(daily,['apparent_temperature_max','apparentTemperatureMax'],index)),apparentTemperatureMin:number(at(daily,['apparent_temperature_min','apparentTemperatureMin'],index)),precipitationSum:number(at(daily,['precipitation_sum','precipitationSum'],index)),precipitationProbabilityMax:number(at(daily,['precipitation_probability_max','precipitationProbabilityMax'],index)),weatherCode:number(at(daily,['weather_code','weatherCode'],index)),windSpeedMax:number(at(daily,['wind_speed_10m_max','windSpeedMax'],index))}));
    const normalizedHourly=(hourly.time||[]).map((time,index)=>({time:typeof time==='string'?time:null,temperature:number(at(hourly,['temperature_2m','temperature'],index)),apparentTemperature:number(at(hourly,['apparent_temperature','apparentTemperature'],index)),humidity:number(at(hourly,['relative_humidity_2m','humidity'],index)),precipitation:number(at(hourly,['precipitation'],index)),precipitationProbability:number(at(hourly,['precipitation_probability','precipitationProbability'],index)),weatherCode:number(at(hourly,['weather_code','weatherCode'],index)),windSpeed:number(at(hourly,['wind_speed_10m','windSpeed'],index)),isDay:number(at(hourly,['is_day','isDay'],index))}));
    return{timezone:typeof response.timezone==='string'?response.timezone:null,fetchedAt:typeof response.fetchedAt==='string'?response.fetchedAt:typeof response.fetched_at==='string'?response.fetched_at:null,current:{time:typeof current.time==='string'?current.time:null,temperature:valueOf(current,'temperature_2m','temperature'),apparentTemperature:valueOf(current,'apparent_temperature','apparentTemperature'),weatherCode:valueOf(current,'weather_code','weatherCode'),windSpeed:valueOf(current,'wind_speed_10m','windSpeed'),precipitation:valueOf(current,'precipitation'),isDay:valueOf(current,'is_day','isDay')},daily:normalizedDaily,hourly:normalizedHourly};
  }
  function forecastState(forecast,day,{online=true,now=Date.now(),maxAgeMs=3*60*60*1000}={}){
    if(!forecast||!Array.isArray(forecast.daily)||!forecast.daily.length)return'missing';
    if(!forecast.daily.some(entry=>dateOf(entry)===day))return'out-of-range';
    if(!online)return'offline';
    const fetched=Date.parse(forecast.fetchedAt||'');
    if(Number.isFinite(fetched)&&Number.isFinite(Number(now))&&Number(now)-fetched>maxAgeMs)return'stale';
    return'normal';
  }
  function needsRefresh(forecast,{now=Date.now(),maxAgeMs=30*60*1000,today=''}={}){
    if(!forecast||!Array.isArray(forecast.daily)||!forecast.daily.length)return true;
    const fetched=Date.parse(forecast.fetchedAt||'');
    if(!Number.isFinite(fetched)||Number(now)-fetched>=maxAgeMs)return true;
    const first=dateOf(forecast.daily[0]),last=dateOf(forecast.daily[forecast.daily.length-1]);
    if(!DAY.test(today||''))return false;
    return !first||first<today||!last||last<today;
  }
  function locationKey(location){
    const point=coordinate(location);
    if(point)return`coord:${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
    const city=typeof location==='string'?location:location?.city??location?.name;
    return typeof city==='string'&&city.trim()?`city:${city.trim().normalize('NFC').toLocaleLowerCase().replace(/\s+/g,' ')}`:'';
  }
  return{resolveDayLocations,nearestHourly,weatherCode,dailyAdvice,normalizeForecast,forecastState,needsRefresh,locationKey};
});
