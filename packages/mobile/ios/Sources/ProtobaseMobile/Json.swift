import Foundation

/** What JSONSerialization gives, read strictly: an integer is neither a bool nor a fraction. */
enum Json {
    static func parse(_ data: Data) -> Any? {
        try? JSONSerialization.jsonObject(with: data, options: [])
    }

    static func integer(_ value: Any?) -> Int64? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        switch String(cString: number.objCType) {
        case "c", "s", "i", "l", "q", "C", "S", "I", "L", "Q":
            // An unsigned value above Int64's range reads as negative, which every caller refuses.
            return number.int64Value
        default:
            return nil
        }
    }
}
