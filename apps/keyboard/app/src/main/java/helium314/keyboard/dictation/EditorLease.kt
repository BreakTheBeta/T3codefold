// SPDX-License-Identifier: GPL-3.0-only
package helium314.keyboard.dictation

/** Rejects transcripts after focus changes or cursor movement, including delayed selection callbacks. */
class EditorLease(start: Int, end: Int) {
    private var expected = start to end
    private val pending = ArrayDeque<Pair<Int, Int>>()
    var valid = true
        private set
    fun invalidate() { valid = false; pending.clear() }
    fun committed(start: Int, end: Int) {
        if (expected != start to end) {
            pending.addLast(expected)
            expected = start to end
            if (pending.size > 32) invalidate()
        }
    }
    fun selection(start: Int, end: Int): Boolean {
        val position = start to end
        if (!valid) return false
        if (position == expected) { pending.clear(); return true }
        if (position in pending) {
            while (pending.isNotEmpty() && pending.removeFirst() != position) { /* coalesced callbacks */ }
            return true
        }
        invalidate()
        return false
    }
}
