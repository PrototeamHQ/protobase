import Foundation
import Security
@testable import ProtobaseMobile

/** A signing key made for a test, with its public key as the CLI pins it: PEM of the SPKI DER. */
struct TestKey {
    let privateKey: SecKey
    let pem: String

    static func rsa() -> TestKey {
        let attributes: [CFString: Any] = [kSecAttrKeyType: kSecAttrKeyTypeRSA, kSecAttrKeySizeInBits: 2048]
        let key = SecKeyCreateRandomKey(attributes as CFDictionary, nil)!
        let pkcs1 = SecKeyCopyExternalRepresentation(SecKeyCopyPublicKey(key)!, nil)! as Data
        let rsaAlgorithm = TestDer.sequence(TestDer.element(0x06, [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]) + TestDer.element(0x05, []))
        return TestKey(privateKey: key, pem: TestDer.pem(TestDer.sequence(rsaAlgorithm + TestDer.element(0x03, [0] + [UInt8](pkcs1)))))
    }

    /** A P-256 public key as SPKI PEM, which the guard must refuse. */
    static func ecPem() -> String {
        let attributes: [CFString: Any] = [kSecAttrKeyType: kSecAttrKeyTypeECSECPrimeRandom, kSecAttrKeySizeInBits: 256]
        let key = SecKeyCreateRandomKey(attributes as CFDictionary, nil)!
        let point = SecKeyCopyExternalRepresentation(SecKeyCopyPublicKey(key)!, nil)! as Data
        let ecAlgorithm = TestDer.sequence(TestDer.element(0x06, [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]) + TestDer.element(0x06, [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]))
        return TestDer.pem(TestDer.sequence(ecAlgorithm + TestDer.element(0x03, [0] + [UInt8](point))))
    }

    var spki: Data { ReleaseKey.parse(pem)!.spki }

    /** SHA256withRSA, as the server's `sign('sha256', …)`. */
    func sign(_ message: Data) -> Data {
        SecKeyCreateSignature(privateKey, .rsaSignatureMessagePKCS1v15SHA256, message as CFData, nil)! as Data
    }
}

enum TestDer {
    static func element(_ tag: UInt8, _ contents: [UInt8]) -> [UInt8] {
        let count = contents.count
        if count < 0x80 { return [tag, UInt8(count)] + contents }
        if count < 0x100 { return [tag, 0x81, UInt8(count)] + contents }
        return [tag, 0x82, UInt8(count >> 8), UInt8(count & 0xff)] + contents
    }

    static func sequence(_ contents: [UInt8]) -> [UInt8] {
        element(0x30, contents)
    }

    static func pem(_ der: [UInt8]) -> String {
        "-----BEGIN PUBLIC KEY-----\n" + Data(der).base64EncodedString(options: [.lineLength64Characters, .endLineWithLineFeed]) + "\n-----END PUBLIC KEY-----\n"
    }
}

/** A release as the server composes it (packages/server/src/mobile-release): its id and every file it serves. */
struct TestRelease {
    static let appId = "net.protobase.test"
    static let fingerprint = "0123456789abcdef"
    static let shellVersion = "0.57.1"

    let bundleId: String
    var served: [String: Data]

    var statement: Data { served[ReleaseStatement.file]! }
    var manifest: Data { served[ReleaseManifest.file]! }

    /**
     * The release of `files` signed with `key`; `manifest` and `payload` stand in for what the server would write,
     * and `signer` signs in place of `key`, whose SPKI still goes into the id.
     */
    static func make(
        _ files: [String: Data], order: [Int64], key: TestKey, appId: String = appId, fingerprint: String = fingerprint, shellVersion: String = shellVersion,
        manifest: Data? = nil, payload: ((Data) -> Data)? = nil, signer: TestKey? = nil
    ) -> TestRelease {
        let manifest = manifest ?? manifestOf(files)
        let fields: [String: Any] = ["manifest": Sha256.of(manifest), "order": order, "appId": appId, "fingerprint": fingerprint, "shellVersion": shellVersion]
        let signedPayload = try! JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys])
        // `payload` changes what the statement carries, not what was signed.
        let statement = statementOf(payload?(signedPayload) ?? signedPayload, key: signer ?? key, signed: signedPayload)
        var served = files
        served[ReleaseManifest.file] = manifest
        served[ReleaseStatement.file] = statement
        return TestRelease(bundleId: idOf(statement, key), served: served)
    }

    static func statementOf(_ payload: Data, key: TestKey, signed: Data? = nil) -> Data {
        let signature = key.sign(Data("protobase-mobile-release\n".utf8) + (signed ?? payload))
        return try! JSONSerialization.data(withJSONObject: ["payload": Hex.encode(payload), "signature": Hex.encode(signature)], options: [.sortedKeys])
    }

    static func idOf(_ statement: Data, _ key: TestKey) -> String {
        String(Sha256.of(statement, key.spki).prefix(16))
    }

    static func manifestOf(_ files: [String: Data]) -> Data {
        manifestOf(entries: files.keys.sorted().map { ["href": $0, "checksum": Sha256.of(files[$0]!), "sizeInBytes": files[$0]!.count] })
    }

    static func manifestOf(entries: [[String: Any]]) -> Data {
        try! JSONSerialization.data(withJSONObject: entries, options: [.sortedKeys])
    }
}

/** Serves releases from memory as the releases URL would, recording every file asked for. */
final class FakeSource: ReleaseSource {
    var releases: [String: [String: Data]] = [:]
    private(set) var requests: [String] = []

    func serve(_ release: TestRelease) {
        releases[release.bundleId] = release.served
    }

    func fetch(bundleId: String, href: String, limit: Int64, into sink: @escaping (Data) throws -> Void) throws {
        requests.append(bundleId + "?href=" + href)
        guard let data = releases[bundleId]?[href] else { throw BundleRefused("the server answered 404 for \(href)") }
        if Int64(data.count) > limit { throw BundleRefused("its \(href) is larger than \(limit) bytes") }
        // In small chunks, as a network would hand them over.
        var at = 0
        while at < data.count {
            let end = min(at + 7, data.count)
            try sink(data.subdata(in: at..<end))
            at = end
        }
    }

    /** The hrefs asked for of release `bundleId`. */
    func hrefs(_ bundleId: String) -> [String] {
        requests.filter { $0.hasPrefix(bundleId + "?href=") }.map { String($0.dropFirst(bundleId.count + 6)) }
    }
}

/** An app's folders and user defaults for one test, removed with it. */
final class TestApp {
    let root = NSTemporaryDirectory() + "live-update-" + UUID().uuidString
    let defaults: UserDefaults
    private let suite = "live-update-tests-" + UUID().uuidString
    let source = FakeSource()
    let key: TestKey
    var currentPath: String?
    var nextPath: String?
    var builtInOrder = "1000"

    var bundles: String { root + "/Library/NoCloud/ionic_built_snapshots" }
    var downloads: String { root + "/Library/NoCloud/protobase_live_update_downloads" }
    var builtInFiles: String { root + "/App.app/public" }

    init(key: TestKey = TestKey.rsa()) {
        self.key = key
        defaults = UserDefaults(suiteName: suite)!
        try! FileManager.default.createDirectory(atPath: builtInFiles, withIntermediateDirectories: true)
        try! FileManager.default.createDirectory(atPath: bundles, withIntermediateDirectories: true)
    }

    deinit {
        defaults.removePersistentDomain(forName: suite)
        try? FileManager.default.removeItem(atPath: root)
    }

    var settings: LiveUpdateSettings {
        LiveUpdateSettings(
            autoUpdateStrategy: "none", autoDeleteBundles: true, autoBlockRolledBackBundles: true, readyTimeout: 30000,
            releasesUrl: "https://api.example.com/api/mobile/releases", publicKey: key.pem, fingerprint: TestRelease.fingerprint,
            shellVersion: TestRelease.shellVersion, builtInOrder: builtInOrder)
    }

    var pins: LiveUpdatePins {
        try! LiveUpdatePins.make(settings, appId: TestRelease.appId).get()
    }

    func environment(_ pins: LiveUpdatePins) -> LiveUpdateGuard.Environment {
        LiveUpdateGuard.Environment(
            bundles: bundles, downloads: downloads, builtInFiles: builtInFiles, defaults: defaults,
            currentPath: { [unowned self] in currentPath }, nextPath: { [unowned self] in nextPath }, source: source)
    }

    /** A guard as the app makes one at its start. */
    func makeGuard() -> LiveUpdateGuard {
        let pins = self.pins
        return LiveUpdateGuard(pins: pins, environment: environment(pins))
    }

    /** The binary's own files, with the manifest the CLI writes beside them. */
    func buildIn(_ files: [String: Data]) {
        for (href, data) in files { write(builtInFiles + "/" + href, data) }
        write(builtInFiles + "/" + ReleaseManifest.file, TestRelease.manifestOf(files))
    }

    func release(_ files: [String: Data], order: [Int64]) -> TestRelease {
        let release = TestRelease.make(files, order: order, key: key)
        source.serve(release)
        return release
    }

    func write(_ path: String, _ data: Data) {
        try! FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
        try! data.write(to: URL(fileURLWithPath: path))
    }

    func bundle(_ id: String) -> String {
        bundles + "/" + id
    }

    func exists(_ path: String) -> Bool {
        LocalFile.kind(path) != .missing
    }

    /** Every path below `dir`, relative to it. */
    func tree(_ dir: String) -> [String] {
        (FileManager.default.enumerator(atPath: dir)?.allObjects as? [String] ?? []).sorted()
    }
}

/** Bytes of `text`, for short test files. */
func bytes(_ text: String) -> Data {
    Data(text.utf8)
}

/** The reason a call refused with, or nil when it did not throw a refusal. */
func refusal(_ body: () throws -> Void) -> String? {
    do {
        try body()
        return nil
    } catch let refused as BundleRefused {
        return refused.reason
    } catch {
        return "unexpected \(type(of: error))"
    }
}
