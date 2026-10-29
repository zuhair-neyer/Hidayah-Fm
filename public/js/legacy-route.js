// Keep bookmarked page URLs working on any static host.
const routes={home:'home',quran:'quran',library:'library','now-playing':'home',account:'account',login:'login',signup:'signup'};
const name=location.pathname.split('/').pop().replace(/\.html$/,'');
location.replace('/#/'+(routes[name]||'home')+location.search);
