import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Capacitor 8.5.3's SPM template, as `cap add ios` writes it: its AppDelegate.swift whole, and the app target's two
// build configurations of its project.pbxproj, where the push setup edits it.

/** For tests: the template's AppDelegate.swift. */
export const templateAppDelegate = `
import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
`

/** For tests: the app target's Debug and Release configurations of the template's project.pbxproj. */
export const templatePbxproj = `
		504EC3171FED79650016851F /* Debug */ = {
			isa = XCBuildConfiguration;
			baseConfigurationReference = 958DCC722DB07C7200EA8C5F /* debug.xcconfig */;
			buildSettings = {
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				INFOPLIST_FILE = App/Info.plist;
				IPHONEOS_DEPLOYMENT_TARGET = 15.0;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
				);
				MARKETING_VERSION = 1.0;
				OTHER_SWIFT_FLAGS = "$(inherited) \\"-D\\" \\"COCOAPODS\\" \\"-DDEBUG\\"";
				PRODUCT_BUNDLE_IDENTIFIER = com.getcapacitor.App;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
			};
			name = Debug;
		};
		504EC3181FED79650016851F /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				INFOPLIST_FILE = App/Info.plist;
				IPHONEOS_DEPLOYMENT_TARGET = 15.0;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
				);
				MARKETING_VERSION = 1.0;
				PRODUCT_BUNDLE_IDENTIFIER = com.getcapacitor.App;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_ACTIVE_COMPILATION_CONDITIONS = "";
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
			};
			name = Release;
		};
/* End XCBuildConfiguration section */
`

/** For tests: the template's iOS project files the push setup edits, in the workspace `ws`. */
export const writeIosTemplate = (ws: string) => {
  const app = path.join(ws, 'ios', 'App')
  mkdirSync(path.join(app, 'App'), { recursive: true })
  mkdirSync(path.join(app, 'App.xcodeproj'), { recursive: true })
  writeFileSync(path.join(app, 'App', 'AppDelegate.swift'), templateAppDelegate)
  writeFileSync(path.join(app, 'App.xcodeproj', 'project.pbxproj'), templatePbxproj)
}
