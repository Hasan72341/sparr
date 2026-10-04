import Foundation
import AppKit
import AVFoundation
import CoreGraphics

// This helper observes the environment. It does not claim comprehensive tamper detection,
// capture video/audio, terminate applications, or activate SEB lockdown.
struct Snapshot: Codable {
    let platform: String
    let version: String
    let displays: Int?
    let cameras: Int
    let cameraPermission: String
    let cameraNames: [String]
    let prohibitedApplications: [String]
    let checksComplete: Bool
    let strictEnforcementValidated: Bool
}
var count: UInt32 = 0
let displayResult = CGGetOnlineDisplayList(0, nil, &count)
let cameraTypes: [AVCaptureDevice.DeviceType]
if #available(macOS 14.0, *) {
    cameraTypes = [.builtInWideAngleCamera, .external, .continuityCamera]
} else {
    cameraTypes = [.builtInWideAngleCamera, .externalUnknown]
}
let devices = AVCaptureDevice.DiscoverySession(deviceTypes: cameraTypes, mediaType: .video, position: .unspecified).devices
let cameraNames = Array(Set(devices.map { $0.localizedName })).sorted()
let permission: String
switch AVCaptureDevice.authorizationStatus(for: .video) {
case .authorized: permission = "authorized"
case .denied: permission = "denied"
case .restricted: permission = "restricted"
case .notDetermined: permission = "not-requested"
@unknown default: permission = "unknown"
}
let prohibited = ["com.obsproject.obs-studio", "com.teamviewer.TeamViewer", "com.philandro.anydesk", "com.apple.ScreenSharing"]
let running = NSWorkspace.shared.runningApplications.compactMap { app -> String? in
    guard let identifier = app.bundleIdentifier, prohibited.contains(identifier) else { return nil }
    return app.localizedName ?? identifier
}.sorted()
let snapshot = Snapshot(platform: "macOS", version: ProcessInfo.processInfo.operatingSystemVersionString,
                        displays: displayResult == .success ? Int(count) : nil,
                        cameras: Set(devices.map { $0.uniqueID }).count,
                        cameraPermission: permission, cameraNames: cameraNames,
                        prohibitedApplications: running, checksComplete: false,
                        strictEnforcementValidated: false)
let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
do { let data = try encoder.encode(snapshot); print(String(decoding: data, as: UTF8.self)) }
catch { fputs("Could not encode the environment snapshot.\n", stderr); exit(1) }
