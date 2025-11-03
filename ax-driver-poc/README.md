# Logic Pro AX Driver - Proof of Concept

Proof of concept for controlling Logic Pro using macOS Accessibility API instead of AppleScript keystrokes.

## Why This POC?

The current CueSynch implementation uses AppleScript with `keystroke` commands to automate Logic Pro. This approach has several issues:

- **Timing-dependent**: Arbitrary `delay` values that may fail on slower systems
- **Context-blind**: Can't verify Logic is in the right state before acting
- **Brittle**: If a dialog is already open, keystrokes go to the wrong place
- **No feedback**: Executes blindly with no error detection
- **Intermittent failures**: Unreliable in production use

This POC tests whether using the **macOS Accessibility (AX) API** provides more reliable automation.

## Architecture

The POC is a minimal Swift CLI tool (~250 lines) that implements core AX functions:

```
ax-driver-poc/
├── Package.swift           # Swift Package Manager config
├── Sources/
│   └── LogicAXDriver/
│       └── main.swift      # Core AX API implementation
├── test-marker-import.sh   # Automated testing script
└── README.md              # This file
```

## Core Functions

### `focusApp(bundleId: String)`
Activates Logic Pro using NSWorkspace (no arbitrary delays).

### `clickMenuItem(bundleId: String, path: [String])`
Navigates menu hierarchy using AX API:
```swift
try clickMenuItem(
    bundleId: "com.apple.logic10",
    path: ["Navigate", "Other", "Import Marker from Audio File"]
)
```

No keystrokes - directly interacts with menu elements.

### `waitForElement(role:title:timeout:) -> Bool`
Waits for specific UI element to appear:
```swift
let found = waitForElement(
    bundleId: "com.apple.logic10",
    role: kAXWindowRole,
    title: "Import",
    timeout: 5.0
)
```

Returns true/false instead of hoping a dialog opened.

### `getSelectedRegion() -> Bool`
Verifies audio region is selected before proceeding.

## Building

Requires macOS 13+ and Swift 5.9+:

```bash
cd ax-driver-poc
swift build -c release
```

Executable will be at: `.build/release/logic-ax`

## Usage

### Test Marker Import
```bash
./test-marker-import.sh
```

This script:
1. Checks Logic Pro is running
2. Builds the AX driver
3. Runs 20 test iterations
4. Reports success rate

**Prerequisites:**
- Logic Pro must be open with a project loaded
- An audio file with BWF markers must be imported
- The audio region must be selected

### Manual Testing

Test menu navigation:
```bash
.build/release/logic-ax test-menu "Navigate,Other,Import Marker from Audio File"
```

Just focus Logic:
```bash
.build/release/logic-ax focus
```

Run marker import workflow:
```bash
.build/release/logic-ax import-markers
```

## Testing Results

Run the automated test to compare reliability:

```bash
./test-marker-import.sh
```

**Success Criteria:**
- **100% success rate**: AX API approach is ready for integration
- **90-99%**: Needs refinement but shows promise
- **<90%**: Approach needs reconsideration

Failed test logs are saved to `/tmp/ax-test-*.log`

## Comparison: AX API vs AppleScript

| Aspect | AppleScript Keystrokes | AX API |
|--------|----------------------|---------|
| **UI State Verification** | ✗ Blind execution | ✓ Can check before acting |
| **Timing** | ✗ Arbitrary delays | ✓ Wait for actual conditions |
| **Error Detection** | ✗ None | ✓ Immediate feedback |
| **Reliability** | ✗ Intermittent failures | ✓ Expected to be 100% |
| **Speed** | ✗ Slow (wait for delays) | ✓ Fast (no unnecessary waits) |
| **Code Complexity** | ✓ Simple | ~ Moderate |

## Next Steps (If POC Succeeds)

### Phase 1: Validate POC
- [x] Build minimal AX driver
- [x] Implement core functions
- [x] Create automated test
- [ ] **Run test-marker-import.sh and measure success rate**

### Phase 2: Integrate with CueSynch (if >90% success)
1. Create N-API bridge (Swift → Node.js)
2. Replace AppleScript section in main.js:180-183
3. Keep everything else unchanged
4. Compare reliability with current approach

### Phase 3: Expand (if marker import is 100% reliable)
1. Replace file import dialog navigation
2. Replace playhead positioning
3. Replace track creation
4. Add comprehensive error handling

## Implementation Notes

### Accessibility Permissions Required

The app calling this tool needs Accessibility permission:
1. **System Settings > Privacy & Security > Accessibility**
2. Add Terminal, VS Code, or whatever runs the tool
3. Enable the checkbox

### Sandboxing

This POC uses direct AX API calls which require **full accessibility permissions**. For a production app:
- Cannot be sandboxed in Mac App Store
- Requires user approval for Accessibility access
- Same requirements as current AppleScript approach

### Performance

AX API calls are synchronous and fast (~10-50ms per operation). No arbitrary delays needed.

## Code Structure

The POC intentionally keeps everything in one file for easy review:

```swift
// Core API Functions (4 functions)
- focusApp()
- clickMenuItem()
- waitForElement()
- getSelectedRegion()

// Main Entry Point
- Command-line argument parsing
- Test workflows
```

Total: ~250 lines of Swift

## Troubleshooting

### Build Errors
```bash
swift build -c release
```
Requires Xcode Command Line Tools: `xcode-select --install`

### "Application 'com.apple.logic10' not running"
Logic Pro must be launched before running any commands.

### "Menu item not found"
Logic Pro's menu structure may differ by version. Check actual menu names in Logic Pro.

### AX API Permission Denied
Enable Accessibility for the calling app in System Settings.

## License

Part of CueSynch - same license as parent project.

## Credits

Inspired by [Soundflow](https://soundflow.org/)'s approach to reliable DAW automation using macOS Accessibility API.
