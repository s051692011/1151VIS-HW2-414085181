/* P2P地震情報 v2 adapter. Documentation: https://www.p2pquake.net/develop/json_api_v2/ */
(function (global) {
  'use strict';
  var ROOT = 'https://api.p2pquake.net/v2';
  var WS_URL = 'wss://api.p2pquake.net/v2/ws';
  function jstDate(v) {
    if (!v || typeof v !== 'string') return null;
    // The provider's yyyy/MM/dd HH:mm:ss timestamps represent Japan Standard Time.
    var s = v.trim();
    var jp = s.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/);
    if (jp) s = jp[1] + '-' + jp[2] + '-' + jp[3] + 'T' + jp[4] + (jp[5] ? '.' + jp[5] : '') + '+09:00';
    var d = new Date(s);
    return isFinite(d.getTime()) ? d : null;
  }
  function normalizeMessage(raw) {
    if (!raw || (raw.code !== 551 && raw.code !== 556)) return null;
    if (raw.code === 556 && raw.cancelled === true) return null;
    var eq = raw.earthquake || {};
    var h = eq.hypocenter || {};
    var lat = Number(h.latitude), lon = Number(h.longitude), mag = Number(h.magnitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 20 || lat > 49 || lon < 119 || lon > 157) return null;
    if (!Number.isFinite(mag) || mag <= 0 || mag >= 12) return null;
    var intensity = Number(eq.maxScale);
    if (!Number.isFinite(intensity) || intensity < 0) intensity = 0;
    var depth = Number(h.depth);
    if (!Number.isFinite(depth) || depth < 0 || depth > 800) depth = null;
    var d = jstDate(eq.time) || jstDate(raw.time) || jstDate(raw.created_at);
    if (!d) return null;
    var pref = Array.isArray(raw.points) ? raw.points.map(function(p) {return typeof p.pref === 'string' ? p.pref : '';}).filter(Boolean) : [];
    pref = pref.filter(function(p, i) {return pref.indexOf(p) === i;});
    return { id:String(raw.id || (raw.code + '-' + d.getTime() + '-' + lat + '-' + lon)), code:raw.code,
      time:d, place: String(h.name || '震央位置未命名'), lat:lat,lon:lon,mag:mag,depth:depth,intensity:intensity,
      pref:pref, tsunami:String(eq.domesticTsunami || 'Unknown'), simulated:false,
      isEew:raw.code === 556 };
  }
  function normalizeDemo(raw) {
    var dt = new Date(raw.time);
    return {id:raw.id,code:551,time:dt,place:raw.place,lat:raw.lat,lon:raw.lon,mag:raw.mag,
      depth:raw.depth,intensity:raw.intensity,pref:raw.pref,tsunami:'None',simulated:true,isEew:false};
  }
  function fetchTimed(url,timeoutMs) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeout = controller ? setTimeout(function(){ controller.abort(); },timeoutMs||10000) : null;
    return fetch(url,{method:'GET',cache:'no-store',signal:controller?controller.signal:undefined})
      .then(function(res){if(!res.ok)throw new Error('HTTP '+res.status);return res.json();})
      .then(function(data){if(!Array.isArray(data))throw new Error('Unexpected response payload');return data;})
      .finally(function(){if(timeout)clearTimeout(timeout);});
  }
  function fetchLatest() {
    // /history offers near-real-time messages. /jma/quake is a delayed historical fallback.
    return fetchTimed(ROOT+'/history?codes=551&limit=70',10000)
      .catch(function(){return fetchTimed(ROOT+'/jma/quake?limit=70',10000);})
      .then(function(items){
        var seen={}; return items.map(normalizeMessage).filter(function(ev){
          if(!ev || seen[ev.id]) return false; seen[ev.id]=true;return true;
        });
      });
  }
  function watch(onEvent,onState) {
    var client=null, timer=null, closed=false, attempts=0;
    function signal(s){if(!closed && onState)onState(s);}
    function connect() {
      if(closed)return;
      signal('connecting');
      try {client=new WebSocket(WS_URL);} catch(e){retry();return;}
      client.onopen=function(){attempts=0;signal('connected');};
      client.onmessage=function(message){
        try{var ev=normalizeMessage(JSON.parse(message.data));if(ev)onEvent(ev);}catch(e){/* invalid frames are ignored */}
      };
      client.onerror=function(){signal('error');};
      client.onclose=function(){client=null;retry();};
    }
    function retry(){if(closed)return;signal('reconnecting');attempts++;timer=setTimeout(connect,Math.min(30000,1000*Math.pow(2,Math.min(attempts,5))));}
    connect();
    return function close(){closed=true;if(timer)clearTimeout(timer);if(client){client.onclose=null;client.close();client=null;}};
  }
  global.SeismicAPI={normalizeMessage:normalizeMessage,normalizeDemo:normalizeDemo,fetchLatest:fetchLatest,watch:watch,jstDate:jstDate};
})(window);
