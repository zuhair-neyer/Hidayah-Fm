if(!process.env.FIREBASE_AUTH_EMULATOR_HOST||!process.env.FIREBASE_DATABASE_EMULATOR_HOST)throw new Error('Browser tests require Firebase emulators. Run npm run test:e2e.');
const {defineConfig,devices}=require('@playwright/test');
const path=require('node:path');
module.exports=defineConfig({
 testDir:'./tests',testMatch:'**/*.spec.cjs',fullyParallel:false,workers:1,timeout:60000,
 reporter:[['list']],outputDir:path.resolve(__dirname,'work/firebase-playwright-results'),
 use:{baseURL:'http://127.0.0.1:3081',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'desktop',use:{viewport:{width:1440,height:1080}}},{name:'mobile',use:{...devices['Pixel 7']}}],
 webServer:{command:'node scripts/serve-static.cjs',url:'http://127.0.0.1:3081/index.html',reuseExistingServer:false,
  env:{PORT:'3081',HOST:'127.0.0.1'}}
});
