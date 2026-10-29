import Foundation

/**
 * Release orders, compared element by element, a missing element counting as 0, so a later server can add one without
 * breaking binaries already shipped. Kept as text such as `1800000000000,0`.
 */
enum ReleaseOrder {
    /** No order: below every release, the highest order downloaded before the app downloaded any. */
    static let none: [Int64] = [0]

    // An order the CLI or the guard writes: up to 8 elements of up to 19 digits, checked for overflow when parsed.
    private static let text = try! NSRegularExpression(pattern: "^[0-9]{1,19}(,[0-9]{1,19}){0,7}$")

    static func compare(_ a: [Int64], _ b: [Int64]) -> Int {
        for i in 0..<max(a.count, b.count) {
            let x = i < a.count ? a[i] : 0
            let y = i < b.count ? b[i] : 0
            if x != y { return x < y ? -1 : 1 }
        }
        return 0
    }

    /**
     * Refuses to download a release of order `order` unless it is above the app's built-in files, `builtIn`, and not
     * below the highest order the app downloaded, `highest`: equal to it is the same release again, which the app
     * downloaded and may still have to set as the next bundle.
     */
    static func acceptDownload(_ order: [Int64], builtIn: [Int64], highest: [Int64]) throws {
        if compare(order, builtIn) <= 0 { throw BundleRefused("it is not newer than the app's built-in files") }
        if compare(order, highest) < 0 { throw BundleRefused("it is older than a release the app downloaded") }
    }

    /**
     * Refuses a bundle of order `next` as the next bundle unless it is above the running one's, `current`, and the
     * built-in files', `builtIn`, and not below the highest order the app downloaded, `highest`.
     */
    static func acceptNext(_ next: [Int64], current: [Int64], builtIn: [Int64], highest: [Int64]) throws {
        if compare(next, current) <= 0 { throw BundleRefused("it is not newer than the bundle the app runs") }
        if compare(next, builtIn) <= 0 { throw BundleRefused("it is not newer than the app's built-in files") }
        if compare(next, highest) < 0 { throw BundleRefused("it is older than a release the app downloaded") }
    }

    static func format(_ order: [Int64]) -> String {
        order.map(String.init).joined(separator: ",")
    }

    /** The order `text` holds, or nil when it is no order's text. */
    static func parse(_ text: String) -> [Int64]? {
        guard self.text.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil else { return nil }
        let parts = text.split(separator: ",").map { Int64($0) }
        guard parts.allSatisfy({ $0 != nil }) else { return nil }
        return parts.map { $0! }
    }

    /**
     * The order the CLI wrote, `plugins.LiveUpdate.builtInOrder`, or nil when it is missing, malformed or no order above
     * none, so the guard never runs with a floor of 0.
     */
    static func parseBuiltIn(_ text: String?) -> [Int64]? {
        guard let text, let order = parse(text), compare(order, none) > 0 else { return nil }
        return order
    }
}
