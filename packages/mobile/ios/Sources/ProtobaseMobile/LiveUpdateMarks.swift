import Foundation

/**
 * The highest order the app downloaded, kept in its user defaults, so a downgrade stays refused after a restart. Read
 * and raised only under the guard's lock. A value the guard cannot read refuses every release rather than counting as
 * none, which would drop the floor.
 */
struct LiveUpdateMarks {
    static let key = "ProtobaseLiveUpdate.highestOrder"

    let defaults: UserDefaults

    func highest() throws -> [Int64] {
        guard let value = defaults.object(forKey: Self.key) else { return ReleaseOrder.none }
        guard let text = value as? String, let order = ReleaseOrder.parse(text) else { throw BundleRefused("the highest order the app downloaded cannot be read") }
        return order
    }

    /** Raises the mark to `order` when it is higher. */
    func raise(_ order: [Int64]) throws {
        if ReleaseOrder.compare(order, try highest()) > 0 { defaults.set(ReleaseOrder.format(order), forKey: Self.key) }
    }
}
