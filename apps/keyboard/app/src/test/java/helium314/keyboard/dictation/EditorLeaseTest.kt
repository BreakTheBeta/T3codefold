// SPDX-License-Identifier: GPL-3.0-only
package helium314.keyboard.dictation

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EditorLeaseTest {
    @Test fun ownDelayedOrCoalescedSelectionUpdatesKeepTheSession() {
        val lease = EditorLease(0, 0)
        lease.committed(5, 5)
        lease.committed(12, 12)
        assertTrue(lease.selection(5, 5))
        assertTrue(lease.selection(12, 12))
        lease.committed(20, 20)
        lease.committed(25, 25)
        assertTrue(lease.selection(25, 25))
    }

    @Test fun movingTheCursorRevokesAllLaterTranscripts() {
        val lease = EditorLease(10, 10)
        lease.committed(20, 20)
        assertFalse(lease.selection(15, 15))
        assertFalse(lease.valid)
        assertFalse(lease.selection(20, 20))
    }

    @Test fun losingTheEditorRevokesPendingOwnSelectionUpdates() {
        val lease = EditorLease(0, 5)
        lease.committed(12, 12)
        lease.invalidate()
        assertFalse(lease.selection(0, 5))
        assertFalse(lease.selection(12, 12))
    }

    @Test fun aNonRespondingEditorDoesNotAccumulateUnboundedHistory() {
        val lease = EditorLease(0, 0)
        repeat(33) { lease.committed(it + 1, it + 1) }
        assertFalse(lease.valid)
    }
}
