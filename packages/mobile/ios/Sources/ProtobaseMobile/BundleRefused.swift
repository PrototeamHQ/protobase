/** Why the guard refuses a release or a bundle, said as the end of "refused release <id>: …". */
struct BundleRefused: Error, Equatable {
    let reason: String

    init(_ reason: String) {
        self.reason = reason
    }
}
