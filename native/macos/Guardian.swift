import Foundation
import AppKit
import AVFoundation
import CoreGraphics
import IOKit
import Security
import Vision
import Darwin

// Local observations, not remote attestation. No media leaves this process.
// The stdout pipe is the only telemetry channel; stdout never carries media.
private let sebBundleID = "org.safeexambrowser.SafeExamBrowser"
// Official SEB 3.7 macOS signing identity, pinned to the upstream release project:
// https://github.com/SafeExamBrowser/seb-mac/blob/3.7/SafeExamBrowser.xcodeproj/project.pbxproj
private let sebRequirementText = "anchor apple generic and identifier \"org.safeexambrowser.SafeExamBrowser\" and certificate leaf[subject.OU] = \"6F38DNSC7X\" and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists"
private let prohibitedBundleIDs: Set<String> = [
    "com.obsproject.obs-studio", "com.teamviewer.TeamViewer", "com.teamviewer.TeamViewerHost",
    "com.philandro.anydesk", "com.anydesk.AnyDesk", "com.apple.ScreenSharing",
    "com.apple.RemoteDesktop", "com.apple.QuickTimePlayerX", "com.apple.screencaptureui",
    "com.loom.desktop", "com.reincubate.camo", "com.reincubate.camo-studio",
    "com.wulkano.kap", "com.getcleanshot.app", "com.timpler.screenstudio",
    "us.zoom.xos", "com.microsoft.teams", "com.microsoft.teams2", "com.hnc.Discord",
    "com.google.Chrome.remote_desktop", "com.splashtop.Splashtop-Streamer"
]
private let null = NSNull()

private func monotonicTime() -> TimeInterval { ProcessInfo.processInfo.systemUptime }

private func vmVerdict(hypervisor: Int32?, model: String?, virtualDevice: Bool?) -> Bool? {
    let normalized = model?.lowercased() ?? ""
    if hypervisor == 1 || virtualDevice == true || ["virtual", "vmware", "parallels", "qemu"].contains(where: normalized.contains) {
        return true
    }
    guard hypervisor == 0, virtualDevice == false,
          normalized.hasPrefix("mac") || normalized.hasPrefix("imac") else { return nil }
    return false
}

private func readSysctlInt(_ key: String) -> Int32? {
    var value: Int32 = 0
    var size = MemoryLayout<Int32>.size
    guard sysctlbyname(key, &value, &size, nil, 0) == 0, size == MemoryLayout<Int32>.size else { return nil }
    return value
}

private func readSysctlString(_ key: String) -> String? {
    var size = 0
    guard sysctlbyname(key, nil, &size, nil, 0) == 0, size > 0, size < 4096 else { return nil }
    var bytes = [CChar](repeating: 0, count: size)
    guard sysctlbyname(key, &bytes, &size, nil, 0) == 0 else { return nil }
    return String(cString: bytes)
}

private func hasVirtualDevice() -> Bool? {
    var iterator: io_iterator_t = 0
    guard IORegistryCreateIterator(kIOMainPortDefault, kIOServicePlane,
                                  IOOptionBits(kIORegistryIterateRecursively), &iterator) == KERN_SUCCESS else { return nil }
    defer { IOObjectRelease(iterator) }
    var count = 0
    while case let entry = IOIteratorNext(iterator), entry != 0 {
        defer { IOObjectRelease(entry) }
        count += 1
        if count > 100_000 { return nil }
        var className = [CChar](repeating: 0, count: 128)
        guard IOObjectGetClass(entry, &className) == KERN_SUCCESS else { return nil }
        let value = String(cString: className).lowercased()
        if value.contains("virtio") || value.contains("virtualplatform") || value.contains("vmware") || value.contains("parallels") {
            return true
        }
    }
    return IOIteratorIsValid(iterator) != 0 ? false : nil
}

private func cameras() -> [AVCaptureDevice] {
    AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera, .external, .continuityCamera, .deskViewCamera],
                                     mediaType: .video, position: .unspecified).devices
}

private func permission(_ mediaType: AVMediaType) -> String {
    switch AVCaptureDevice.authorizationStatus(for: mediaType) {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "not-requested"
    @unknown default: return "unknown"
    }
}

private func displayState() -> (Int?, Bool) {
    var count: UInt32 = 0
    var displays = [CGDirectDisplayID](repeating: 0, count: 64)
    guard CGGetOnlineDisplayList(UInt32(displays.count), &displays, &count) == .success,
          count < displays.count else { return (nil, false) }
    return (Int(count), displays.prefix(Int(count)).contains { CGDisplayIsInMirrorSet($0) != 0 })
}

private func supportedSEBVersion(_ version: String) -> Bool {
    let components = version.split(separator: ".", omittingEmptySubsequences: false)
    guard components.count >= 2, components.allSatisfy({ !$0.isEmpty && $0.allSatisfy(\.isNumber) }),
          let major = Int(components[0]), let minor = Int(components[1]) else { return false }
    return major > 3 || (major == 3 && minor >= 7)
}

private func verifiedSEB(_ pid: pid_t) -> NSRunningApplication? {
    guard pid > 1, let app = NSRunningApplication(processIdentifier: pid), !app.isTerminated,
          app.bundleIdentifier == sebBundleID,
          let bundleURL = app.bundleURL,
          let version = Bundle(url: bundleURL)?.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
          supportedSEBVersion(version) else { return nil }
    var code: SecCode?
    let attributes = [kSecGuestAttributePid as String: NSNumber(value: pid)] as CFDictionary
    guard SecCodeCopyGuestWithAttributes(nil, attributes, [], &code) == errSecSuccess, let code else { return nil }
    var requirement: SecRequirement?
    guard SecRequirementCreateWithString(sebRequirementText as CFString, [], &requirement) == errSecSuccess,
          let requirement,
          SecCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSStrictValidate), requirement) == errSecSuccess else { return nil }
    return app
}

// Keep the original process start time so a recycled PID cannot target a new app.
private struct SEBIdentity: Equatable {
    let pid: pid_t
    // Epoch seconds, serialized as a JSON number and matched without rounding.
    let startedAt: TimeInterval

    func application() -> NSRunningApplication? {
        guard let app = verifiedSEB(pid), let launched = app.launchDate,
              Self.matchesStartTime(startedAt, launched.timeIntervalSince1970) else { return nil }
        return app
    }

    static func matchesStartTime(_ expected: TimeInterval, _ actual: TimeInterval) -> Bool {
        expected.isFinite && expected > 0 && expected == actual
    }

    static func parseExitArguments(_ args: [String]) -> SEBIdentity? {
        guard args.count == 3, args[0] == "--exit-seb", let pid = pid_t(args[1]), pid > 1,
              let startedAt = Double(args[2]), startedAt.isFinite, startedAt > 0 else { return nil }
        return SEBIdentity(pid: pid, startedAt: startedAt)
    }
}

private struct ExitSchedule {
    let began: TimeInterval
    func forceDelay(at now: TimeInterval) -> TimeInterval { max(0, began + 2 - now) }
}

// Trust is established once by full signature + original launch-time validation.
// Retain this NSRunningApplication instance: unlike constructing another object
// from a PID later, it represents the original process even after PID recycling.
// Final exit must not redo potentially blocking Security validation after the
// force deadline. It only verifies continuity of the already trusted handle.
private final class TrustedSEBTarget {
    let identity: SEBIdentity
    private let application: NSRunningApplication

    init?(_ identity: SEBIdentity) {
        guard let application = identity.application() else { return nil }
        self.identity = identity
        self.application = application
    }

    private var isOriginalProcess: Bool {
        guard !application.isTerminated, application.processIdentifier == identity.pid,
              let launched = application.launchDate else { return false }
        return SEBIdentity.matchesStartTime(identity.startedAt, launched.timeIntervalSince1970)
    }

    func terminate() {
        if isOriginalProcess { application.terminate() }
    }

    func forceTerminate() {
        if isOriginalProcess { application.forceTerminate() }
    }
}

private func sebSnapshot() -> [String: Any]? {
    let apps = NSRunningApplication.runningApplications(withBundleIdentifier: sebBundleID).filter { !$0.isTerminated }
    guard let app = apps.first, let launched = app.launchDate else { return nil }
    let version = app.bundleURL.flatMap { Bundle(url: $0)?.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String } ?? "unknown"
    return ["pid": Int(app.processIdentifier), "startedAt": launched.timeIntervalSince1970,
            "validSignature": apps.count == 1 && verifiedSEB(app.processIdentifier) != nil,
            "frontmost": NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier, "version": version]
}

private final class Capture: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "dev.sparr.guardian.capture")
    private let videoQueue = DispatchQueue(label: "dev.sparr.guardian.video")
    private let audioQueue = DispatchQueue(label: "dev.sparr.guardian.audio")
    private let lock = NSLock()
    private var stopped = false
    private var lastVideo: TimeInterval?
    private var lastAudio: TimeInterval?
    private var faces: Int?
    private var lastAnalysis: TimeInterval = 0
    private var selectedCameraID: String?

    func requestAccessAndStart() {
        request(.video) { [weak self] in
            guard let self, !self.isStopped else { return }
            self.request(.audio) { [weak self] in self?.start() }
        }
    }

    private var isStopped: Bool { lock.lock(); defer { lock.unlock() }; return stopped }

    private func request(_ type: AVMediaType, completion: @escaping () -> Void) {
        guard !isStopped else { return }
        if AVCaptureDevice.authorizationStatus(for: type) == .notDetermined {
            AVCaptureDevice.requestAccess(for: type) { _ in completion() }
        } else { completion() }
    }

    private func start() {
        sessionQueue.async { [weak self] in
            guard let self, !self.isStopped, permission(.video) == "authorized", permission(.audio) == "authorized",
                  let camera = cameras().first(where: { $0.deviceType == .builtInWideAngleCamera }),
                  let microphone = AVCaptureDevice.default(for: .audio) else { return }
            do {
                let videoInput = try AVCaptureDeviceInput(device: camera)
                let audioInput = try AVCaptureDeviceInput(device: microphone)
                let video = AVCaptureVideoDataOutput()
                video.alwaysDiscardsLateVideoFrames = true
                video.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
                video.setSampleBufferDelegate(self, queue: self.videoQueue)
                let audio = AVCaptureAudioDataOutput()
                audio.setSampleBufferDelegate(self, queue: self.audioQueue)
                self.session.beginConfiguration()
                self.session.sessionPreset = .vga640x480
                guard self.session.canAddInput(videoInput), self.session.canAddInput(audioInput) else {
                    self.session.commitConfiguration(); return
                }
                self.session.addInput(videoInput)
                self.session.addInput(audioInput)
                guard self.session.canAddOutput(video), self.session.canAddOutput(audio) else {
                    self.session.commitConfiguration(); return
                }
                self.session.addOutput(video)
                self.session.addOutput(audio)
                self.session.commitConfiguration()
                self.lock.lock(); self.selectedCameraID = camera.uniqueID; self.lock.unlock()
                if !self.isStopped { self.session.startRunning() }
            } catch { fputs("Guardian could not initialize camera and microphone capture.\n", stderr) }
        }
    }

    func stop(completion: @escaping () -> Void) {
        lock.lock(); stopped = true; lock.unlock()
        sessionQueue.async {
            if self.session.isRunning { self.session.stopRunning() }
            self.session.beginConfiguration()
            for output in self.session.outputs { self.session.removeOutput(output) }
            for input in self.session.inputs { self.session.removeInput(input) }
            self.session.commitConfiguration()
            self.lock.lock(); self.lastVideo = nil; self.lastAudio = nil; self.faces = nil; self.lock.unlock()
            completion()
        }
    }

    func state(at now: TimeInterval, devices: [AVCaptureDevice]) -> [String: Any] {
        let running = session.isRunning
        lock.lock(); defer { lock.unlock() }
        func age(_ timestamp: TimeInterval?) -> Any { timestamp.map { max(0, Int((now - $0) * 1000)) } as Any? ?? null }
        let physical = selectedCameraID.map { id in devices.contains { $0.uniqueID == id && $0.deviceType == .builtInWideAngleCamera } }
            ?? devices.contains { $0.deviceType == .builtInWideAngleCamera }
        return ["physicalCamera": physical, "captureRunning": !stopped && running,
                "videoAgeMs": age(lastVideo), "audioAgeMs": age(lastAudio), "faceCount": faces as Any? ?? null]
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard !isStopped, CMSampleBufferDataIsReady(sampleBuffer) else { return }
        let now = monotonicTime()
        if output is AVCaptureAudioDataOutput {
            lock.lock(); lastAudio = now; lock.unlock()
            return
        }
        guard let image = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lock.lock(); lastVideo = now; lock.unlock()
        guard now - lastAnalysis >= 1 else { return }
        lastAnalysis = now
        // Synchronous Vision work retains this frame only until this callback returns.
        let request = VNDetectFaceRectanglesRequest()
        do {
            try VNImageRequestHandler(cvPixelBuffer: image, orientation: .up, options: [:]).perform([request])
            lock.lock(); faces = request.results?.count; lock.unlock()
        } catch { lock.lock(); faces = nil; lock.unlock() }
    }
}

private enum Command {
    case ping, arm(pid_t, TimeInterval), stop, exitSEB
    static func parse(_ data: Data) -> Command? {
        guard data.count <= 4096, let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = object["type"] as? String else { return nil }
        switch type {
        case "ping": return .ping
        case "stop": return .stop
        case "exit-seb": return .exitSEB
        case "arm":
            guard let value = object["pid"] as? NSNumber,
                  CFGetTypeID(value) != CFBooleanGetTypeID(), value.doubleValue.rounded() == value.doubleValue,
                  value.int64Value > 1, value.int64Value <= Int64(Int32.max),
                  let start = object["startedAt"] as? NSNumber, CFGetTypeID(start) != CFBooleanGetTypeID(),
                  start.doubleValue.isFinite, start.doubleValue > 0 else { return nil }
            return .arm(pid_t(value.int64Value), start.doubleValue)
        default: return nil
        }
    }
}

// Pure lifecycle decisions are exercised by --self-test without starting media.
// Guardian's lock serializes access; signature validation happens before bind.
private struct GuardianLifecycle {
    struct Shutdown { let target: SEBIdentity? }
    var armed: SEBIdentity?
    var stopping = false
    var lastPing: TimeInterval

    mutating func bind(_ identity: SEBIdentity, at now: TimeInterval) -> Bool {
        guard !stopping, armed == nil else { return false }
        armed = identity
        lastPing = now
        return true
    }

    func expired(at now: TimeInterval) -> Bool { now - lastPing > 6 }

    mutating func beginShutdown(exitSEB: Bool) -> Shutdown? {
        guard !stopping else { return nil }
        stopping = true
        let result = Shutdown(target: exitSEB ? armed : nil)
        armed = nil
        return result
    }
}

private final class Guardian {
    private let capture = Capture()
    private let lock = NSLock()
    private let inputQueue = DispatchQueue(label: "dev.sparr.guardian.input")
    private let watchdogQueue = DispatchQueue(label: "dev.sparr.guardian.watchdog")
    private let exitDeadlineQueue = DispatchQueue(label: "dev.sparr.guardian.shutdown-deadline")
    private let sampleQueue = DispatchQueue(label: "dev.sparr.guardian.snapshots")
    private var lifecycle = GuardianLifecycle(lastPing: monotonicTime())
    private var armedTarget: TrustedSEBTarget?
    private var input = Data()
    private var sequence = 0
    private var sampler: DispatchSourceTimer?
    private var watchdog: DispatchSourceTimer?
    private var signalSources: [DispatchSourceSignal] = []

    func snapshot() -> [String: Any] {
        sequence += 1
        lock.lock(); let armedIdentity = lifecycle.armed; lock.unlock()
        // Revalidate the original launch identity on the sampling queue. A slow
        // Security check can stale the sample but cannot stall the watchdog.
        let armedPID = armedIdentity?.application()?.processIdentifier
        let (displays, mirrored) = displayState()
        let devices = cameras()
        let vm = vmVerdict(hypervisor: readSysctlInt("kern.hv_vmm_present"), model: readSysctlString("hw.model"), virtualDevice: hasVirtualDevice())
        var value: [String: Any] = ["version": 1, "sequence": sequence, "armedPid": armedPID as Any? ?? null, "displays": displays as Any? ?? null,
            "mirrored": mirrored, "cameras": Set(devices.map { $0.uniqueID }).count,
            "virtualMachine": vm as Any? ?? null, "cameraPermission": permission(.video), "microphonePermission": permission(.audio),
            "prohibitedApplications": Array(Set(NSWorkspace.shared.runningApplications.compactMap { app in
                app.bundleIdentifier.flatMap { prohibitedBundleIDs.contains($0) && !app.isTerminated ? $0 : nil }
            })).sorted(), "seb": sebSnapshot() as Any? ?? null]
        value.merge(capture.state(at: monotonicTime(), devices: devices)) { _, new in new }
        return value
    }

    func emitSnapshot() {
        do {
            var data = try JSONSerialization.data(withJSONObject: snapshot(), options: [.sortedKeys])
            data.append(0x0a)
            try FileHandle.standardOutput.write(contentsOf: data)
        } catch { shutdown(exitSEB: true) }
    }

    func run() {
        // SIGPIPE must not bypass the independent exit fallback.
        signal(SIGPIPE, SIG_IGN)
        for signum in [SIGTERM, SIGINT, SIGHUP] {
            signal(signum, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: signum, queue: watchdogQueue)
            source.setEventHandler { [weak self] in self?.shutdown(exitSEB: true) }
            source.resume(); signalSources.append(source)
        }
        let sampler = DispatchSource.makeTimerSource(queue: sampleQueue)
        sampler.schedule(deadline: .now(), repeating: .seconds(1))
        sampler.setEventHandler { [weak self] in self?.emitSnapshot() }
        sampler.resume(); self.sampler = sampler
        let watchdog = DispatchSource.makeTimerSource(queue: watchdogQueue)
        watchdog.schedule(deadline: .now(), repeating: .milliseconds(250))
        watchdog.setEventHandler { [weak self] in
            guard let self else { return }
            self.lock.lock(); let expired = self.lifecycle.expired(at: monotonicTime()); self.lock.unlock()
            // An unarmed abandoned preflight must also release camera/microphone.
            if expired { self.shutdown(exitSEB: true) }
        }
        watchdog.resume(); self.watchdog = watchdog
        FileHandle.standardInput.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard let self else { return }
            self.inputQueue.async { self.receive(data) }
        }
        capture.requestAccessAndStart()
    }

    private func receive(_ data: Data) {
        if data.isEmpty { shutdown(exitSEB: true); return }
        input.append(data)
        if input.count > 65_536 { shutdown(exitSEB: true); return }
        while let newline = input.firstIndex(of: 0x0a) {
            let line = input.prefix(upTo: newline)
            input.removeSubrange(...newline)
            guard let command = Command.parse(Data(line)) else { continue }
            switch command {
            case .ping: lock.lock(); lifecycle.lastPing = monotonicTime(); lock.unlock()
            case .arm(let pid, let startedAt):
                let identity = SEBIdentity(pid: pid, startedAt: startedAt)
                guard let trustedTarget = TrustedSEBTarget(identity) else { continue }
                lock.lock()
                let accepted = lifecycle.bind(identity, at: monotonicTime())
                if accepted { armedTarget = trustedTarget }
                lock.unlock()
                if accepted { sampleQueue.async { [weak self] in self?.emitSnapshot() } }
            case .stop: shutdown(exitSEB: false)
            case .exitSEB: shutdown(exitSEB: true)
            }
        }
    }

    private func shutdown(exitSEB: Bool) {
        lock.lock()
        let decision = lifecycle.beginShutdown(exitSEB: exitSEB)
        let target = decision?.target == armedTarget?.identity ? armedTarget : nil
        if decision != nil { armedTarget = nil }
        lock.unlock()
        guard decision != nil else { return }
        // Install deadlines before any Security/AppKit/AVFoundation work.
        // The watchdog queue must never synchronously validate a signature.
        exitDeadlineQueue.asyncAfter(deadline: .now() + (target == nil ? 2 : 2.5)) { Darwin.exit(0) }
        if let target {
            let schedule = ExitSchedule(began: monotonicTime())
            DispatchQueue.global().asyncAfter(deadline: .now() + schedule.forceDelay(at: monotonicTime())) { target.forceTerminate() }
            DispatchQueue.global().async { target.terminate() }
        }
        capture.stop { if target == nil { Darwin.exit(0) } }
        FileHandle.standardInput.readabilityHandler = nil
        sampler?.cancel(); watchdog?.cancel()
    }
}

private func selfTest() {
    var checks = 0
    func require(_ condition: @autoclosure () -> Bool, _ message: String) {
        checks += 1
        if !condition() { fputs("Guardian self-test failed: \(message)\n", stderr); exit(1) }
    }
    require(vmVerdict(hypervisor: 0, model: "Mac15,12", virtualDevice: false) == false, "physical evidence")
    require(vmVerdict(hypervisor: 1, model: "Mac15,12", virtualDevice: false) == true, "hypervisor evidence")
    require(vmVerdict(hypervisor: 0, model: "VirtualMac2,1", virtualDevice: false) == true, "model evidence")
    require(vmVerdict(hypervisor: 0, model: "Mac15,12", virtualDevice: true) == true, "virtual device evidence")
    require(vmVerdict(hypervisor: nil, model: "Mac15,12", virtualDevice: false) == nil, "missing sysctl fails closed")
    require(vmVerdict(hypervisor: 0, model: "unknown", virtualDevice: false) == nil, "unknown model fails closed")
    require(vmVerdict(hypervisor: 0, model: "Mac15,12", virtualDevice: nil) == nil, "missing registry fails closed")
    for pid in ["true", "1", "2.5", "4294967296", "\"42\""] {
        require(Command.parse(Data("{\"type\":\"arm\",\"pid\":\(pid),\"startedAt\":123.456}".utf8)) == nil, "invalid PID rejected")
    }
    for startedAt in ["true", "0", "-1", "null", "\"123.456\""] {
        require(Command.parse(Data("{\"type\":\"arm\",\"pid\":42,\"startedAt\":\(startedAt)}".utf8)) == nil, "invalid launch date rejected")
    }
    require(Command.parse(Data("{\"type\":\"arm\",\"pid\":42}".utf8)) == nil, "missing launch date rejected")
    require(Command.parse(Data("{}".utf8)) == nil, "missing command rejected")
    if case .arm(let pid, let startedAt) = Command.parse(Data("{\"type\":\"arm\",\"pid\":42,\"startedAt\":123.456}".utf8)) {
        require(pid == 42 && startedAt == 123.456, "PID and launch date parsed")
    }
    else { require(false, "valid command parsed") }
    let fixture = SEBIdentity(pid: 42, startedAt: 123.456)
    require(SEBIdentity.parseExitArguments(["--exit-seb", "42", "123.456"]) == fixture, "exit arguments preserve identity")
    for args in [["--exit-seb", "42"], ["--exit-seb", "42", "nan"], ["--exit-seb", "42", "inf"],
                 ["--exit-seb", "42", "-1"], ["--exit-seb", "1", "123.456"], ["--exit-seb", "42", "123.456", "extra"]] {
        require(SEBIdentity.parseExitArguments(args) == nil, "invalid exit arguments rejected")
    }
    require(SEBIdentity.matchesStartTime(123.456, 123.456), "exact launch time matches")
    require(!SEBIdentity.matchesStartTime(123.456, 123.456.nextUp), "different launch time rejected")
    require(!SEBIdentity.matchesStartTime(.nan, .nan), "NaN launch time rejected")
    let exitSchedule = ExitSchedule(began: 10)
    require(exitSchedule.forceDelay(at: 10) == 2, "initial exit grace is two seconds")
    require(exitSchedule.forceDelay(at: 10.75) == 1.25, "validation time consumes rather than extends the exit grace")
    require(exitSchedule.forceDelay(at: 12) == 0, "force exit is due at the original deadline")
    require(exitSchedule.forceDelay(at: 12.75) == 0, "late successful validation forces exit immediately")
    var lifecycle = GuardianLifecycle(lastPing: 10)
    require(!lifecycle.expired(at: 16), "heartbeat boundary allowed")
    require(lifecycle.expired(at: 16.0001), "expired parent detected")
    require(lifecycle.bind(fixture, at: 20), "first verified identity binds")
    require(!lifecycle.expired(at: 26), "arm resets parent deadline")
    require(!lifecycle.bind(SEBIdentity(pid: 43, startedAt: 124), at: 21), "armed identity cannot be replaced")
    require(lifecycle.beginShutdown(exitSEB: true)?.target == fixture, "parent failure retains only armed identity for exit")
    require(lifecycle.armed == nil, "shutdown unarms")
    require(lifecycle.beginShutdown(exitSEB: true) == nil, "shutdown is idempotent")
    require(!lifecycle.bind(fixture, at: 30), "stopped guardian cannot rearm")
    var cancelled = GuardianLifecycle(armed: fixture, lastPing: 10)
    require(cancelled.beginShutdown(exitSEB: false)?.target == nil, "stop releases without terminating SEB")
    var preflight = GuardianLifecycle(lastPing: 10)
    require(preflight.beginShutdown(exitSEB: true)?.target == nil, "unarmed EOF cannot terminate an application")
    require(verifiedSEB(getpid()) == nil, "guardian process is not SEB")
    require(TrustedSEBTarget(SEBIdentity(pid: getpid(), startedAt: 123.456)) == nil, "retained exit handles require signature verification")
    require(supportedSEBVersion("3.7"), "SEB 3.7 supported")
    require(supportedSEBVersion("3.7.1"), "SEB patch supported")
    require(supportedSEBVersion("4.0"), "SEB later major supported")
    require(!supportedSEBVersion("3.6.1"), "old SEB rejected")
    require(!supportedSEBVersion("unknown"), "unknown SEB version rejected")
    require(!supportedSEBVersion("3.7.foo"), "malformed SEB version rejected")
    var requirement: SecRequirement?
    require(SecRequirementCreateWithString(sebRequirementText as CFString, [], &requirement) == errSecSuccess, "signature requirement parses")
    print("Guardian self-tests passed (\(checks) checks; no camera/microphone capture).")
}

let arguments = Array(CommandLine.arguments.dropFirst())
if arguments == ["--self-test"] { selfTest(); exit(0) }
if arguments.first == "--exit-seb" {
    guard let identity = SEBIdentity.parseExitArguments(arguments) else {
        fputs("Refusing exit: both an exact PID and original launch time are required.\n", stderr); exit(2)
    }
    // The independent fallback also has a deadline if Security/AppKit stalls.
    let schedule = ExitSchedule(began: monotonicTime())
    let deadline = DispatchQueue(label: "dev.sparr.guardian.exit-deadline")
    deadline.asyncAfter(deadline: .now() + 4) { exit(3) }
    DispatchQueue.global().async {
        guard let target = TrustedSEBTarget(identity) else {
            fputs("Refusing exit: original PID/launch time is not a running officially signed SEB process.\n", stderr); exit(2)
        }
        // A slow initial validation consumes the graceful-exit budget. Once
        // trust is established after that deadline, force exit immediately.
        DispatchQueue.global().asyncAfter(deadline: .now() + schedule.forceDelay(at: monotonicTime())) { target.forceTerminate(); exit(0) }
        target.terminate()
    }
    RunLoop.main.run()
    exit(0)
}
private let guardian = Guardian()
if arguments == ["--inspect"] { guardian.emitSnapshot(); exit(0) }
guard arguments.isEmpty else { fputs("Usage: sparr-guardian [--inspect | --self-test | --exit-seb PID STARTED_AT]\n", stderr); exit(2) }
_ = NSApplication.shared
NSApp.setActivationPolicy(.accessory)
guardian.run()
RunLoop.main.run()
