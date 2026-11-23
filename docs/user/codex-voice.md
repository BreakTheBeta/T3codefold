# Talk to Codex (Fold beta)

Open a thread and choose **Call this thread**. Allow microphone access, wait for
**Voice live**, then speak. A separate Codex voice companion can read the selected
thread, send it questions or instructions, steer active work, interrupt it, and
answer ordinary pending questions. The work thread keeps its own provider and
model, including Claude and other providers. Permission approvals stay in the app.
You can start the call before sending the thread's first message.

Install the matching Fold server and client. The host needs a Codex CLI signed in
with ChatGPT and realtime access; the client needs no Codex installation or API key.
The companion uses that server account. API-key authentication does not substitute
for a ChatGPT voice subscription. Update Codex if call negotiation is unavailable.
The companion runs separately from the coding agent, and ending the call does not
cancel work already accepted by a thread.

For a host such as beta1, pair the client with that environment and open a
thread there. Voice uses the selected environment's Codex account. Both host
and client need internet access. Remote web pages require HTTPS, including on
a tailnet; an HTTP LAN address cannot request browser microphone access. Use
the fork's web client, since the upstream hosted app does not include this beta.

Start mobile voice with the app open. Android calls can continue when the screen
locks or the app goes into the background; an ongoing call notification lets you
return or end the call. Calls stay connected while you browse other threads, files,
diffs, or Settings. The voice panel shows which task the call belongs to; browsing
does not change that task. Short network interruptions
show **Reconnecting** while the client waits for audio to recover.

Android uses the system call audio routes. Pair Bluetooth glasses or a headset and
enable **Phone calls** for that device in Android Bluetooth settings. Allow Nearby
devices access when requested by T3. Connected call-capable headsets are preferred;
otherwise the call uses speakerphone. The audio output control lists the
phone speaker and available headsets or earpiece by name. Use the phone volume buttons or
the **Increase call volume** control during a call. Actual headset compatibility
and call controls depend on the device's Bluetooth support.

Open **Settings → Voice** on web, desktop or mobile, or expand the voice panel to choose a
speaking voice and microphone. Voice choices come from the connected host and apply
to the next call. Microphone changes apply immediately. **Mute mic** pauses what you
send; **Mute speaker** silences what you hear. Mobile also offers the system audio
route picker for headsets and speakerphone.

Expand the voice panel for the current call’s transcript and the coding agent’s
status. Speech transcripts are separate from accepted chat messages and do not
prove that the agent has acted. The transcript stays in client memory until you
start another call or close the panel.

Enable **Share what I’m viewing** to send bounded excerpts of the open file, diff,
and pending question to the call. This is optional and off by default. It uses
content already loaded in T3; it does not capture your screen or other apps.
Turning sharing off stops future updates but cannot remove already shared content.

Say **“end voice call”** to hang up, or **“switch voice to [thread title]”** to move
the work destination to a uniquely named thread. Switching threads on the same
environment keeps the call connected. Switching to another environment reconnects
using that server’s account. You can also choose a thread in the voice panel.
Duplicate titles require choosing the thread explicitly. Browsing alone never
changes the destination. The companion reads a bounded recent transcript window;
it does not receive the entire project or historical transcript automatically.

Web and desktop also expose voice actions in the command palette. The default
shortcuts are **Ctrl+Alt+V** (start/end), **Ctrl+Alt+M** (microphone mute), and
**Ctrl+Alt+S** (speaker mute); use **Cmd** instead of **Ctrl** on macOS. Web/desktop
shortcuts can be changed in keyboard settings. Mobile hardware keyboards use the
same combinations (Cmd on iOS).

You can update the client first and update connected Fold hosts gradually. Each
connection enables advanced controls only when its host advertises support.
On older hosts that already support Fold live voice, calls use the original
Codex-thread-only start/stop protocol and switching threads reconnects audio. Microphone selection, separate mute controls, local shortcuts,
and navigation during a call remain available. Voice selection, transcripts,
view sharing, spoken call controls, and automatic idle-session resumption need an
updated host. Saved voice and sharing preferences are retained for updated hosts.

Older clients can keep using basic voice with an updated host. Reconnect after a
host update to discover its capabilities; an active call does not change modes
mid-conversation. Updating a server can interrupt its active calls.

Web/desktop voice shortcuts use their defaults on older hosts; custom voice
keybindings need an updated host. Mobile hardware shortcut changes require a new
native installation, not an OTA-only update.
