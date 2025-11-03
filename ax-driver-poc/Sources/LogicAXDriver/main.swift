import Cocoa
import ApplicationServices

// MARK: - Error Types

enum AXError: Error {
    case applicationNotFound(String)
    case elementNotFound(String)
    case timeout(String)
    case actionFailed(String)
    case invalidState(String)
}

// MARK: - Helper Functions

/// Get AXUIElement for a running application by bundle ID
func getAppElement(bundleId: String) throws -> AXUIElement {
    let runningApps = NSWorkspace.shared.runningApplications
    guard let app = runningApps.first(where: { $0.bundleIdentifier == bundleId }) else {
        throw AXError.applicationNotFound("Application '\(bundleId)' not running")
    }

    return AXUIElementCreateApplication(app.processIdentifier)
}

/// Find menu bar item by title
func findMenuBarItem(in menuBar: AXUIElement, title: String) -> AXUIElement? {
    var children: CFTypeRef?
    guard AXUIElementCopyAttributeValue(menuBar, kAXChildrenAttribute as CFString, &children) == .success,
          let items = children as? [AXUIElement] else {
        return nil
    }

    for item in items {
        var titleValue: CFTypeRef?
        guard AXUIElementCopyAttributeValue(item, kAXTitleAttribute as CFString, &titleValue) == .success,
              let itemTitle = titleValue as? String else {
            continue
        }

        if itemTitle == title {
            return item
        }
    }

    return nil
}

/// Find menu item in a menu by title
func findMenuItem(in menu: AXUIElement, title: String) -> AXUIElement? {
    var children: CFTypeRef?
    guard AXUIElementCopyAttributeValue(menu, kAXChildrenAttribute as CFString, &children) == .success,
          let items = children as? [AXUIElement] else {
        return nil
    }

    for item in items {
        var titleValue: CFTypeRef?
        guard AXUIElementCopyAttributeValue(item, kAXTitleAttribute as CFString, &titleValue) == .success,
              let itemTitle = titleValue as? String else {
            continue
        }

        if itemTitle == title {
            return item
        }
    }

    return nil
}

/// Find element by role in a container
func findElement(in container: AXUIElement, role: String, title: String? = nil) -> AXUIElement? {
    var children: CFTypeRef?
    guard AXUIElementCopyAttributeValue(container, kAXChildrenAttribute as CFString, &children) == .success,
          let items = children as? [AXUIElement] else {
        return nil
    }

    for item in items {
        var roleValue: CFTypeRef?
        guard AXUIElementCopyAttributeValue(item, kAXRoleAttribute as CFString, &roleValue) == .success,
              let itemRole = roleValue as? String else {
            continue
        }

        if itemRole == role {
            if let expectedTitle = title {
                var titleValue: CFTypeRef?
                guard AXUIElementCopyAttributeValue(item, kAXTitleAttribute as CFString, &titleValue) == .success,
                      let itemTitle = titleValue as? String else {
                    continue
                }
                if itemTitle == expectedTitle {
                    return item
                }
            } else {
                return item
            }
        }

        // Recursively search children
        if let found = findElement(in: item, role: role, title: title) {
            return found
        }
    }

    return nil
}

/// Set text field value
func setTextFieldValue(_ element: AXUIElement, value: String) throws {
    let result = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, value as CFTypeRef)
    guard result == .success else {
        throw AXError.actionFailed("Failed to set text field value: \(result.rawValue)")
    }
}

/// Click button or element
func clickElement(_ element: AXUIElement) throws {
    let result = AXUIElementPerformAction(element, kAXPressAction as CFString)
    guard result == .success else {
        throw AXError.actionFailed("Failed to click element: \(result.rawValue)")
    }
}

// MARK: - Core API Functions

/// Activate (focus) an application by bundle ID
func focusApp(bundleId: String) throws {
    let runningApps = NSWorkspace.shared.runningApplications
    guard let app = runningApps.first(where: { $0.bundleIdentifier == bundleId }) else {
        throw AXError.applicationNotFound("Application '\(bundleId)' not running")
    }

    app.activate(options: [.activateIgnoringOtherApps])

    // Wait a bit for activation
    Thread.sleep(forTimeInterval: 0.5)
}

/// Click a menu item by navigating through menu path
/// Example: clickMenuItem(bundleId: "com.apple.logic10", path: ["Navigate", "Other", "Import Marker from Audio File"])
func clickMenuItem(bundleId: String, path: [String]) throws {
    let appElement = try getAppElement(bundleId: bundleId)

    // Get menu bar
    var menuBarValue: CFTypeRef?
    guard AXUIElementCopyAttributeValue(appElement, kAXMenuBarAttribute as CFString, &menuBarValue) == .success,
          let menuBar = menuBarValue as! AXUIElement? else {
        throw AXError.elementNotFound("Menu bar not found")
    }

    guard path.count >= 2 else {
        throw AXError.invalidState("Menu path must have at least 2 items")
    }

    // Find top-level menu
    guard let topMenuItem = findMenuBarItem(in: menuBar, title: path[0]) else {
        throw AXError.elementNotFound("Top menu '\(path[0])' not found")
    }

    // Get the menu from the menu bar item
    var menuValue: CFTypeRef?
    guard AXUIElementCopyAttributeValue(topMenuItem, kAXChildrenAttribute as CFString, &menuValue) == .success,
          let menus = menuValue as? [AXUIElement],
          let topMenu = menus.first else {
        throw AXError.elementNotFound("Menu for '\(path[0])' not found")
    }

    // Navigate through submenu path
    var currentMenu = topMenu
    var currentMenuItem: AXUIElement?

    for i in 1..<path.count {
        let title = path[i]

        guard let menuItem = findMenuItem(in: currentMenu, title: title) else {
            throw AXError.elementNotFound("Menu item '\(title)' not found in path")
        }

        currentMenuItem = menuItem

        // If not the last item, get its submenu
        if i < path.count - 1 {
            var submenuValue: CFTypeRef?
            guard AXUIElementCopyAttributeValue(menuItem, kAXChildrenAttribute as CFString, &submenuValue) == .success,
                  let submenus = submenuValue as? [AXUIElement],
                  let submenu = submenus.first else {
                throw AXError.elementNotFound("Submenu for '\(title)' not found")
            }
            currentMenu = submenu
        }
    }

    // Click the final menu item
    guard let finalItem = currentMenuItem else {
        throw AXError.invalidState("No menu item to click")
    }

    let result = AXUIElementPerformAction(finalItem, kAXPressAction as CFString)
    guard result == .success else {
        throw AXError.actionFailed("Failed to click menu item '\(path.last!)': \(result.rawValue)")
    }

    print("✓ Clicked menu item: \(path.joined(separator: " > "))")
}

/// Wait for a UI element to appear
/// Returns true if found within timeout, false otherwise
func waitForElement(bundleId: String, role: String, title: String? = nil, timeout: TimeInterval = 5.0) -> Bool {
    let appElement = (try? getAppElement(bundleId: bundleId))
    guard let app = appElement else { return false }

    let startTime = Date()

    while Date().timeIntervalSince(startTime) < timeout {
        var windowsValue: CFTypeRef?
        guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &windowsValue) == .success,
              let windows = windowsValue as? [AXUIElement] else {
            Thread.sleep(forTimeInterval: 0.1)
            continue
        }

        for window in windows {
            var roleValue: CFTypeRef?
            guard AXUIElementCopyAttributeValue(window, kAXRoleAttribute as CFString, &roleValue) == .success,
                  let windowRole = roleValue as? String else {
                continue
            }

            if windowRole == role {
                // If title specified, check it matches
                if let expectedTitle = title {
                    var titleValue: CFTypeRef?
                    guard AXUIElementCopyAttributeValue(window, kAXTitleAttribute as CFString, &titleValue) == .success,
                          let windowTitle = titleValue as? String else {
                        continue
                    }

                    if windowTitle == expectedTitle {
                        print("✓ Found element: \(role) '\(expectedTitle)'")
                        return true
                    }
                } else {
                    print("✓ Found element: \(role)")
                    return true
                }
            }
        }

        Thread.sleep(forTimeInterval: 0.1)
    }

    return false
}

/// Set playhead position using Go to Position dialog
func setPlayheadPosition(bundleId: String, timecode: String) throws {
    print("Setting playhead to: \(timecode)")

    // Use menu: Navigate > Go To > Position… (with Unicode ellipsis)
    try clickMenuItem(bundleId: bundleId, path: ["Navigate", "Go To", "Position…"])

    Thread.sleep(forTimeInterval: 0.5)

    // Find the Go to Position dialog
    let appElement = try getAppElement(bundleId: bundleId)
    var windowsValue: CFTypeRef?
    guard AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &windowsValue) == .success,
          let windows = windowsValue as? [AXUIElement] else {
        throw AXError.elementNotFound("Could not get windows")
    }

    // Find dialog window
    var goToDialog: AXUIElement?
    for window in windows {
        var titleValue: CFTypeRef?
        if AXUIElementCopyAttributeValue(window, kAXTitleAttribute as CFString, &titleValue) == .success,
           let title = titleValue as? String,
           title.contains("Go to") || title == "" {
            goToDialog = window
            break
        }
    }

    guard let dialog = goToDialog else {
        throw AXError.elementNotFound("Go to Position dialog not found")
    }

    // Find text field and set value
    if let textField = findElement(in: dialog, role: kAXTextFieldRole as String) {
        try setTextFieldValue(textField, value: timecode)
        print("✓ Set playhead position to \(timecode)")

        // Press OK button or Return
        if let okButton = findElement(in: dialog, role: kAXButtonRole as String, title: "OK") {
            try clickElement(okButton)
        }

        Thread.sleep(forTimeInterval: 0.3)
    } else {
        throw AXError.elementNotFound("Text field not found in Go to Position dialog")
    }
}

/// Create new audio track
func createAudioTrack(bundleId: String) throws {
    print("Creating new audio track...")
    try clickMenuItem(bundleId: bundleId, path: ["Track", "New Audio Track"])
    Thread.sleep(forTimeInterval: 0.5)
    print("✓ Created new audio track")
}

/// Helper to escape strings for AppleScript (handles Swedish characters Å, Ä, Ö)
func escapeForAppleScript(_ string: String) -> String {
    // Don't do any normalization - main.js already normalized to NFC
    // Just escape backslashes first, then quotes
    return string
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\"", with: "\\\"")
}

/// Import audio file using File > Import > Audio File dialog
func importAudioFile(bundleId: String, dirPath: String, fileName: String) throws {
    print("Importing audio file: \(fileName)")

    // Open import dialog using AX API (with Unicode ellipsis)
    try clickMenuItem(bundleId: bundleId, path: ["File", "Import", "Audio File…"])

    Thread.sleep(forTimeInterval: 1.5)

    // Escape paths for AppleScript (handles Swedish characters)
    let escapedDirPath = escapeForAppleScript(dirPath)
    let escapedFileName = escapeForAppleScript(fileName)

    // Write the AppleScript to a temporary file with explicit UTF-8 encoding
    // This avoids character encoding corruption when passing through Process arguments
    let script = """
    tell application "System Events"
        tell process "Logic Pro"
            -- Navigate to folder in open dialog
            keystroke "g" using {command down, shift down}
            delay 0.5
            keystroke "\(escapedDirPath)"
            delay 0.5
            keystroke return

            delay 1

            -- Type filename to select it
            keystroke "\(escapedFileName)"
            delay 0.5
            keystroke return

            delay 0.5
        end tell
    end tell
    """

    // Create temporary file with UTF-8 encoding
    let tempDir = FileManager.default.temporaryDirectory
    let scriptFile = tempDir.appendingPathComponent("logic-import-\(UUID().uuidString).scpt")

    do {
        try script.write(to: scriptFile, atomically: true, encoding: .utf8)

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = [scriptFile.path]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        try process.run()
        process.waitUntilExit()

        // Clean up temp file
        try? FileManager.default.removeItem(at: scriptFile)

        if process.terminationStatus == 0 {
            print("✓ Audio file imported")
        } else {
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            throw AXError.actionFailed("AppleScript failed: \(output)")
        }
    } catch let error as AXError {
        // Re-throw AX errors
        throw error
    } catch {
        // Clean up temp file on error
        try? FileManager.default.removeItem(at: scriptFile)
        throw AXError.actionFailed("Failed to create or execute AppleScript: \(error.localizedDescription)")
    }
}

/// Import markers from the imported audio file
func importMarkersFromAudio(bundleId: String) throws {
    print("Importing markers from audio file...")
    try clickMenuItem(bundleId: bundleId, path: ["Navigate", "Other", "Import Marker from Audio File"])
    Thread.sleep(forTimeInterval: 0.5)
    print("✓ Markers imported from audio file")
}

/// Complete workflow: set playhead, create track, import file, import markers
func completeWorkflow(bundleId: String, timecode: String, dirPath: String, fileName: String) throws {
    print("Starting complete automation workflow...")
    print("=========================================\n")

    // 1. Focus Logic Pro
    print("1. Focusing Logic Pro...")
    try focusApp(bundleId: bundleId)

    // 2. Wait for Logic Pro window
    print("\n2. Waiting for Logic Pro window...")
    let windowFound = waitForElement(bundleId: bundleId, role: kAXWindowRole as String, timeout: 3.0)
    guard windowFound else {
        throw AXError.timeout("Logic Pro window not found")
    }

    // 3. Set playhead position (skipped - menu path varies by Logic version)
    // print("\n3. Setting playhead position...")
    // try setPlayheadPosition(bundleId: bundleId, timecode: timecode)

    // 3. Create audio track
    print("\n3. Creating audio track...")
    try createAudioTrack(bundleId: bundleId)

    // 4. Import audio file
    print("\n4. Importing audio file...")
    try importAudioFile(bundleId: bundleId, dirPath: dirPath, fileName: fileName)

    // 5. Import markers from audio
    print("\n5. Importing markers from audio...")
    try importMarkersFromAudio(bundleId: bundleId)

    print("\n=========================================")
    print("✓ Complete workflow finished successfully!")
}

// MARK: - Main Entry Point

@main
struct LogicAXDriver {
    static func main() {
        print("Logic Pro AX Driver - Full Implementation")
        print("==========================================\n")

        do {
            // Parse command line arguments
            let args = CommandLine.arguments

            if args.count < 2 {
                printUsage()
                return
            }

            let command = args[1]

            switch command {
            case "workflow":
                if args.count < 5 {
                    print("Usage: logic-ax workflow <timecode> <dirPath> <fileName>")
                    print("Example: logic-ax workflow \"01 00 00 00\" \"/path/to/files\" \"marker_list.wav\"")
                    return
                }
                let timecode = args[2]
                let dirPath = args[3]
                let fileName = args[4]
                try completeWorkflow(bundleId: "com.apple.logic10", timecode: timecode, dirPath: dirPath, fileName: fileName)

            case "set-playhead":
                if args.count < 3 {
                    print("Usage: logic-ax set-playhead <timecode>")
                    print("Example: logic-ax set-playhead \"01 00 00 00\"")
                    return
                }
                let timecode = args[2]
                try focusApp(bundleId: "com.apple.logic10")
                try setPlayheadPosition(bundleId: "com.apple.logic10", timecode: timecode)

            case "create-track":
                try focusApp(bundleId: "com.apple.logic10")
                try createAudioTrack(bundleId: "com.apple.logic10")

            case "import-file":
                if args.count < 4 {
                    print("Usage: logic-ax import-file <dirPath> <fileName>")
                    return
                }
                let dirPath = args[2]
                let fileName = args[3]
                try focusApp(bundleId: "com.apple.logic10")
                try importAudioFile(bundleId: "com.apple.logic10", dirPath: dirPath, fileName: fileName)

            case "import-markers":
                try focusApp(bundleId: "com.apple.logic10")
                try importMarkersFromAudio(bundleId: "com.apple.logic10")

            case "test-menu":
                if args.count < 3 {
                    print("Usage: logic-ax test-menu <menu-path>")
                    print("Example: logic-ax test-menu \"Navigate,Other,Import Marker from Audio File\"")
                    return
                }
                let menuPath = args[2].split(separator: ",").map(String.init)
                try testMenuNavigation(path: menuPath)

            case "focus":
                try focusApp(bundleId: "com.apple.logic10")
                print("✓ Logic Pro focused")

            case "list-menu":
                if args.count < 3 {
                    print("Usage: logic-ax list-menu <menu-name>")
                    print("Example: logic-ax list-menu File")
                    return
                }
                let menuName = args[2]
                try listMenuItems(bundleId: "com.apple.logic10", menuName: menuName)

            default:
                print("Unknown command: \(command)")
                printUsage()
            }

        } catch {
            print("✗ Error: \(error)")
            exit(1)
        }
    }

    static func printUsage() {
        print("Usage:")
        print("  logic-ax workflow <tc> <dir> <file>  - Complete automation workflow")
        print("  logic-ax set-playhead <timecode>     - Set playhead position")
        print("  logic-ax create-track                - Create new audio track")
        print("  logic-ax import-file <dir> <file>    - Import audio file")
        print("  logic-ax import-markers              - Import markers from audio")
        print("  logic-ax test-menu <path>            - Test menu navigation")
        print("  logic-ax list-menu <name>            - List all items in a menu")
        print("  logic-ax focus                       - Focus Logic Pro")
        print("\nExamples:")
        print("  logic-ax workflow \"01 00 00 00\" \"/Users/me/files\" \"markers.wav\"")
        print("  logic-ax set-playhead \"01 00 00 00\"")
        print("  logic-ax test-menu \"Navigate,Go to Position…\"")
        print("  logic-ax list-menu File")
    }

    static func listMenuItems(bundleId: String, menuName: String) throws {
        guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).first else {
            throw AXError.applicationNotFound("Application '\(bundleId)' not running")
        }

        let appElement = AXUIElementCreateApplication(app.processIdentifier)

        // Get menu bar
        var menuBarRef: AnyObject?
        let menuBarResult = AXUIElementCopyAttributeValue(appElement, kAXMenuBarAttribute as CFString, &menuBarRef)

        guard menuBarResult == .success, let menuBar = menuBarRef else {
            throw AXError.elementNotFound("Menu bar not found")
        }

        // Get all menu bar items
        var itemsRef: AnyObject?
        let itemsResult = AXUIElementCopyAttributeValue(menuBar as! AXUIElement, kAXChildrenAttribute as CFString, &itemsRef)

        guard itemsResult == .success, let items = itemsRef as? [AXUIElement] else {
            throw AXError.elementNotFound("Menu bar items not found")
        }

        // Find the requested menu
        for item in items {
            var titleRef: AnyObject?
            AXUIElementCopyAttributeValue(item, kAXTitleAttribute as CFString, &titleRef)

            if let title = titleRef as? String, title == menuName {
                print("=== \(menuName) Menu Items ===\n")

                // Get the menu itself
                var menuRef: AnyObject?
                AXUIElementCopyAttributeValue(item, kAXChildrenAttribute as CFString, &menuRef)

                if let menuItems = menuRef as? [AXUIElement], let firstMenu = menuItems.first {
                    var childrenRef: AnyObject?
                    AXUIElementCopyAttributeValue(firstMenu, kAXChildrenAttribute as CFString, &childrenRef)

                    if let children = childrenRef as? [AXUIElement] {
                        for (index, child) in children.enumerated() {
                            var itemTitleRef: AnyObject?
                            AXUIElementCopyAttributeValue(child, kAXTitleAttribute as CFString, &itemTitleRef)

                            var roleRef: AnyObject?
                            AXUIElementCopyAttributeValue(child, kAXRoleAttribute as CFString, &roleRef)

                            let itemTitle = itemTitleRef as? String ?? "(no title)"
                            let role = roleRef as? String ?? "(no role)"

                            // Check if it has a submenu
                            var hasSubmenu = false
                            var submenuRef: AnyObject?
                            if AXUIElementCopyAttributeValue(child, kAXChildrenAttribute as CFString, &submenuRef) == .success {
                                if let submenuItems = submenuRef as? [AXUIElement], !submenuItems.isEmpty {
                                    hasSubmenu = true
                                }
                            }

                            let submenuIndicator = hasSubmenu ? " ▸" : ""
                            print("\(index + 1). \(itemTitle)\(submenuIndicator) [\(role)]")

                            // If it has a submenu, list those items too
                            if hasSubmenu {
                                var submenuChildrenRef: AnyObject?
                                if let submenuElement = submenuRef as? [AXUIElement], let firstSubmenu = submenuElement.first {
                                    AXUIElementCopyAttributeValue(firstSubmenu, kAXChildrenAttribute as CFString, &submenuChildrenRef)

                                    if let submenuChildren = submenuChildrenRef as? [AXUIElement] {
                                        for submenuChild in submenuChildren {
                                            var submenuTitleRef: AnyObject?
                                            AXUIElementCopyAttributeValue(submenuChild, kAXTitleAttribute as CFString, &submenuTitleRef)
                                            let submenuTitle = submenuTitleRef as? String ?? "(no title)"
                                            print("    → \(submenuTitle)")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                print("\n✓ Listed all menu items in '\(menuName)' menu")
                return
            }
        }

        throw AXError.elementNotFound("Menu '\(menuName)' not found")
    }

    static func testMenuNavigation(path: [String]) throws {
        let bundleId = "com.apple.logic10"

        print("Testing menu navigation...")
        print("Path: \(path.joined(separator: " > "))\n")

        try focusApp(bundleId: bundleId)
        Thread.sleep(forTimeInterval: 0.5)

        try clickMenuItem(bundleId: bundleId, path: path)

        print("\n✓ Menu navigation successful!")
    }
}
