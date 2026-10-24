import { webPartDir } from './web-part'

/** The Capacitor hooks, scripts in the workspace's package.json, run after `cap copy` and `cap update`; `add` and `sync` run both. */
export const appPluginsHooks = ['capacitor:copy:after', 'capacitor:update:after']

/** Where each platform's native project keeps the app's files, as Capacitor copies them from the web part. */
export const nativeWebDirs = { ios: 'ios/App/App/public', android: 'android/app/src/main/assets/public' }

const dirs = Object.entries(nativeWebDirs)
  .map(([platform, dir]) => `${platform}:'${dir}'`)
  .join(',')

/**
 * The hook's command: copies the web part's `plugins/`, the app's own UI plugins, back into the platform's files.
 * Capacitor keeps `plugins/` for Cordova plugins and removes it on every copy and update, so without this the app finds
 * no plugin.json at `/plugins/<name>/` and turns its plugins off. Single quotes only, for any shell npm scripts run in.
 */
export const appPluginsCommand = `node -e "const fs=require('fs');const to={${dirs}}[process.env.CAPACITOR_PLATFORM_NAME];if(to&&fs.existsSync('${webPartDir}/plugins'))fs.cpSync('${webPartDir}/plugins',to+'/plugins',{recursive:true})"`
