// swift-tools-version: 5.9
import PackageDescription

// Protobase's iOS plugin, which `cap add ios` compiles into the app's CapApp-SPM package by the name it gives
// @protobase/mobile: ProtobaseMobile.
let package = Package(
    name: "ProtobaseMobile",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "ProtobaseMobile", targets: ["ProtobaseMobile"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "ProtobaseMobile",
            dependencies: [.product(name: "Capacitor", package: "capacitor-swift-pm")],
            path: "ios/Sources/ProtobaseMobile")
    ]
)
