import Foundation

/** What a host's check for a release did. */
public enum HostedCheck: Equatable {
    /** The server named no new release, or gave no answer. */
    case unchanged
    /** A new release is downloaded, checked and set next, in this folder: the host swaps it in when it likes. */
    case ready(URL)
    /** The release the server named was refused, and why. */
    case refused(String)
    /** The release could not be downloaded. */
    case failed
}
