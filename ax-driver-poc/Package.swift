// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LogicAXDriver",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "logic-ax",
            targets: ["LogicAXDriver"]
        )
    ],
    targets: [
        .executableTarget(
            name: "LogicAXDriver",
            path: "Sources/LogicAXDriver"
        )
    ]
)
