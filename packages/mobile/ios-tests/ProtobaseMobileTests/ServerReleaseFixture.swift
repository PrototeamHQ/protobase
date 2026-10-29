import Foundation

/**
 * A release the server's own `composeRelease` (packages/server/src/mobile-release/release.ts) signed with a key made
 * for this fixture, so the guard is proven against the server's format rather than against these tests' copy of it.
 */
enum ServerReleaseFixture {
    static let publicKey = "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA163RqyKAA4QucwNSC5YA\n6Ie9RzbbrsyvhFfzWOYh9PT/wemlvvolFl+9ABhYdqWr/GugNKeNPMBpfz5OteAL\nuijY890Fhr4nvyV9f7LDJTJrMhK92B3YEIyZYHjdXqbq4CumXq5La3A/3GKgOSZc\nuudffkHGr52x1xETu9Y91n8NSGbw3LnY1uxE6UcpIx2KE7mBwbJsm2PHgLAxxY5u\n5drcyU79mM4b25biQ9iuzlzBXdeAwSMEh1ZSDf56aOwBYKKo51Z/u0pM6zVi5Q4I\nweSrl9vXzk/RUF+LBecu5bWO9/M7f9N35Prkz+BU/GUZNUUInTyEajWkMLhPZrCF\nVwIDAQAB\n-----END PUBLIC KEY-----"
    static let bundleId = "bea814b6e8104db1"
    static let appId = "net.protobase.fixture"
    static let fingerprint = "0123456789abcdef"
    static let shellVersion = "0.57.1"
    static let order: [Int64] = [1800000000000, 0]
    /** Every file the server serves for the release, the statement and the manifest included, as base64. */
    static let files: [String: String] = [
        "index.html": "PCFkb2N0eXBlIGh0bWw+PHRpdGxlPmZpeHR1cmU8L3RpdGxlPgo=",
        "assets/app.js": "Y29uc29sZS5sb2coMSkK",
        "capawesome-live-update-manifest.json": "W3siaHJlZiI6ImFzc2V0cy9hcHAuanMiLCJjaGVja3N1bSI6IjM4NzlhNWQ5MzBhZTE5OTliMjc4YTNhNDk4ZjdkZTNmZDgzYmE4ZGFlNTkzMzBmY2ZhMmRiMzFjMTAzYWMyMWQiLCJzaXplSW5CeXRlcyI6MTV9LHsiaHJlZiI6ImluZGV4Lmh0bWwiLCJjaGVja3N1bSI6IjhjNTA1MjZhZTA2ZmVmOTc1NDhjN2U0NTFkMzc1MGIzMjhjNTVjYjAxZWRjNjdmNDdhNmQ4ZWQwNGNkMTdlMzQiLCJzaXplSW5CeXRlcyI6Mzh9XQ==",
        "protobase-release.json": "eyJwYXlsb2FkIjoiN2IyMjZkNjE2ZTY5NjY2NTczNzQyMjNhMjIzMjY2NjE2NTMxMzUzMTMwMzQ2MTM0NjY2NDY2MzczMzMxMzczOTM0MzMzNTY1Mzk2MTYyMzU2MjYxMzQ2NTMzNjIzMTYzNjY2NTM4MzkzODMwNjMzMDMwMzk2NjYzNjMzMDM4MzkzODMzMzgzNjM5NjQ2MjYzMzgzNjM3NjUzNzIyMmMyMjZmNzI2NDY1NzIyMjNhNWIzMTM4MzAzMDMwMzAzMDMwMzAzMDMwMzAzMDJjMzA1ZDJjMjI2MTcwNzA0OTY0MjIzYTIyNmU2NTc0MmU3MDcyNmY3NDZmNjI2MTczNjUyZTY2Njk3ODc0NzU3MjY1MjIyYzIyNjY2OTZlNjc2NTcyNzA3MjY5NmU3NDIyM2EyMjMwMzEzMjMzMzQzNTM2MzczODM5NjE2MjYzNjQ2NTY2MjIyYzIyNzM2ODY1NmM2YzU2NjU3MjczNjk2ZjZlMjIzYTIyMzAyZTM1MzcyZTMxMjI3ZCIsInNpZ25hdHVyZSI6Ijc3MDExMGZlODkxYWQ2NjhiZDE3N2U1MGQ3MDU5NzVjM2I5NDZmNDQyOWIzMGMyNjdiMmY3YWQzY2MzOTNkOGFhMWRlMWFkZWJkYjZjOTQ1MWQxN2NkNjRjYzA1YWY1MzU3NTQ1MTcxZmQyYzczZDlhMGZiM2RkNWJlZWYwNjAzNWRmYmYwYzg1ZTkwYzVmOTgwNGU2ZDc5YzcxYmFlNzcxNGM4NGQxOTFiNjkwODRmYzMxYWQwZTg2YzM5OThlODE0Zjc4NWU2NzU1ZDNjYmI1MzY0MTI5ZDUxNWQxYzZiNDFlMjliMzNjODZlNTBlZGE2ZDRjOGM0ZDM1YzhhNzc0ZjY5NWViOGM2Nzg4ZjE1OTE1NGFhNjAwY2YzYWUzYzZjZDI4Nzc0MTE4YWNlZmU0ZGZhOWEwOGI2MTdlNzI1NWE4ZWM1ZjczN2E3NWQzNDk0Y2E5ZjNlMjNkNWNjMzQ3Y2E0YTgxYjIzNTNiMjQxNzI3ODEwMmUwMzllMTc1OTM4Yzc2MjNmMGE5MDJjMzlkODRlY2FhN2E1YTI0MDIxMGEwMjE3MTk5NGU3MjE2OWM5OGI4NTE2NDc0ZDRkNDI5ZGU3NWJiYTk4ZTVlMDA4MzIwNDJiYjI4YjZiMTUzYmRiMGRmZWYyM2JkYTE5OGI0NTlhY2EzYTg5ODZkYzcwIn0=",
    ]

    static func file(_ href: String) -> Data {
        Data(base64Encoded: files[href]!)!
    }
}
