import Foundation

/**
 * Downloads release `bundleId` from `releasesUrl/<id>?href=<file>` into a folder, in place of the stock downloader,
 * which joins a manifest's hrefs to its path unchecked and checks each file only against its own signature
 * (LiveUpdate.swift, downloadBundleFiles and verifyFile, of @capawesome/capacitor-live-update 8.7.1). First the
 * statement, checked against the id, the key, this binary and the highest order the app downloaded; then the manifest,
 * checked against the statement and every href before any file is fetched; then each file, hashed as it is written
 * and refused unless it is the one the manifest names. A file the running bundle has with the same checksum
 * (OwnFiles) is copied from it and hashed again, so it is bound by its content, never by its href.
 */
struct ReleaseDownload {
    let source: ReleaseSource
    let key: ReleaseKey
    let binary: ReleaseBinary

    /**
     * Fills the empty folder `dir` with release `bundleId`, copying what `own` has, and checks it as a whole: its order
     * above the built-in files' `builtIn` and not below `highest`, the highest the app downloaded. Returns its statement.
     */
    func download(_ bundleId: String, into dir: String, own: OwnFiles, builtIn: [Int64], highest: [Int64]) throws -> ReleaseStatement {
        let statementBytes = try fetch(bundleId, ReleaseStatement.file, limit: ReleaseStatement.maxBytes)
        let statement = try ReleaseStatement.verify(statementBytes, bundleId: bundleId, key: key)
        try binary.accept(statement)
        try ReleaseOrder.acceptDownload(statement.order, builtIn: builtIn, highest: highest)
        let manifestBytes = try fetch(bundleId, ReleaseManifest.file, limit: ReleaseManifest.maxBytes)
        let manifest = try ReleaseManifest.verify(manifestBytes, statement: statement)
        for item in manifest.items {
            let target = dir + "/" + item.href
            try FileManager.default.createDirectory(atPath: (target as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
            if let copy = own.path(item.checksum), (try? write(target, item) { sink in try LocalFile.stream(copy, item.href) { try sink.write($0) } }) == true {
                continue
            }
            unlink(target)
            let fetched = try write(target, item) { sink in try source.fetch(bundleId: bundleId, href: item.href, limit: item.size) { try sink.write($0) } }
            if !fetched { throw BundleRefused("its \(item.href) is not the file its manifest names") }
        }
        try LocalFile.create(dir + "/" + ReleaseStatement.file, statementBytes)
        try LocalFile.create(dir + "/" + ReleaseManifest.file, manifestBytes)
        return try BundleCheck.check(dir, bundleId: bundleId, key: key, binary: binary)
    }

    // Writes the new file `target` from `fill`; whether it is exactly the file `item` names.
    private func write(_ target: String, _ item: ReleaseManifest.Item, _ fill: (FileSink) throws -> Void) throws -> Bool {
        let sink = try FileSink(target, limit: item.size)
        try fill(sink)
        return try sink.finish() == item.checksum && sink.size == item.size
    }

    private func fetch(_ bundleId: String, _ href: String, limit: Int) throws -> Data {
        var data = Data()
        try source.fetch(bundleId: bundleId, href: href, limit: Int64(limit)) { data.append($0) }
        return data
    }
}
