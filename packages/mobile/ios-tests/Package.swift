// swift-tools-version: 5.9
import PackageDescription

// The unit tests of Protobase's iOS plugin. They sit outside its package, which apps compile and which ships without
// them, and outside `ios/`, where `cap add ios` searches every Swift file for plugin classes (@capacitor/cli
// util/iosplugin.js).
// Run on a Simulator: xcodebuild test -scheme ProtobaseMobileTests-Package -destination 'platform=iOS Simulator,name=<a Simulator>'
let package = Package(
    name: "ProtobaseMobileTests",
    platforms: [.iOS(.v15)],
    dependencies: [
        .package(path: ".."),
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.3"),
    ],
    targets: [
        .testTarget(
            name: "ProtobaseMobileTests",
            dependencies: [
                .product(name: "ProtobaseMobile", package: "mobile"),
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                // Capacitor's module needs Cordova's beside it, as the app's own package (CapApp-SPM) has it.
                .product(name: "Cordova", package: "capacitor-swift-pm"),
            ],
            path: "ProtobaseMobileTests")
    ]
)
