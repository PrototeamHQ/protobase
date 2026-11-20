/**
 * What a check does with the server's answer, by the shell's rules (swap-decision.ts): the id of a release to download
 * and set next, or nil. A required release is skipped, as the guard refuses it for another shell version; a release
 * that runs or runs next, no release and no answer change nothing, since the answer is not signed.
 */
enum SwapDecision {
    static func take(_ answer: ReleaseAnswer?, current: String?, next: String?) -> String? {
        guard let answer, let id = answer.bundleId, !answer.required, id != current, id != next else { return nil }
        return id
    }
}
