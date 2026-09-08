# Codex

For one account, use the default Codex provider with your normal Codex login.
[Provider setup](./install.md#providers) covers installation, Settings > Providers,
and custom binaries or environment variables.

## Use multiple accounts

A shared Codex home with a shadow home lets work and personal accounts continue
the same threads. The accounts share Codex sessions and configuration while keeping
their own login and available models.

Keep your first account in `~/.codex`. On the environment's machine, sign the
second account into a fresh directory:

```bash
mkdir -p ~/.codex_personal
CODEX_HOME=~/.codex_personal codex login
```

Then add a second Codex instance in **Settings > Providers**:

| Instance       | CODEX_HOME path | Shadow home path    |
| -------------- | --------------- | ------------------- |
| Codex Work     | `~/.codex`      | Leave empty         |
| Codex Personal | `~/.codex`      | `~/.codex_personal` |

Both instances must use the same **CODEX_HOME path**. T3 Code prepares the shared
state in the shadow directory; do not populate it by copying your whole Codex
home.

The shadow account needs its own `auth.json` file. If Codex uses an OS credential
store, configure file storage for this setup. See
[OpenAI's credential storage guide](https://learn.chatgpt.com/docs/auth#credential-storage).

Use a completely separate **CODEX_HOME path**, with no shadow home, when you want
separate Codex sessions and configuration. That instance cannot continue threads
from the other home.

## Switch accounts in an existing thread

Choose the other account from the thread's model picker. T3 Code offers compatible
Codex instances that share the thread's **CODEX_HOME path**. Changing accounts does
not move the conversation into a separate Codex home.

If the account is missing from the picker, compare the home paths in provider
settings. If two instances show the same unexpected account or models, check their
reported accounts, refresh provider status, and confirm the second instance has
its own shadow path and login. A shadow-home conflict usually means the directory
contains a copied Codex setup. Use a fresh shadow directory and sign in again.

## Answer questions while Codex works

Codex can ask a question and keep working. Answer it in the thread's question
panel. The answer becomes a new message: it reaches the active turn, or starts
another turn if Codex has finished. Unanswered questions survive reconnects.
If you do not want to answer, dismiss the question from its panel. Dismissing
closes it without sending anything to Codex. This requires a Codex version that
supports async questions.

## Approve app access

Codex tools can request access to another app. Respond to the named app's request
in the thread on web, desktop, or mobile. Some tools offer access for one request,
the current session, or permanently. See [Permission modes](./permission-modes.md)
for command and file approvals.

## Codex says I hit a usage limit

When Codex stops on a usage limit, the thread names the window that ran out and
when it resets, when Codex reports them. Send the message again after the reset. On a workspace plan the
message also says whether your workspace owner needs to add credits or raise the
spend limit to continue sooner.

## Send feedback to OpenAI

In an existing Codex thread, send `/feedback` with an optional description, for
example `/feedback The agent stopped before finishing the tests`. This uploads
the conversation and Codex logs to OpenAI. The returned thread ID can be shared
with OpenAI support.

## Talk to Codex (Fold beta)

Open an existing Codex thread and choose **Talk to Codex** to start a two-way voice
conversation. Allow microphone access, wait for **Voice live**, then speak. Mute
pauses your microphone; **End Codex voice** ends the call. Send the thread's first
message before starting voice. Other providers do not support this mode.

Install the voice-enabled Fold server on your host and the matching desktop,
web, or mobile client. The host needs a signed-in Codex CLI version 0.145.0 or
newer with realtime access; T3 enables its experimental realtime feature for
managed sessions. Restart an existing Codex session after upgrading the host.

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

Open **Settings → General → Live voice** on web/desktop, **Settings → Live voice**
on mobile, or expand the voice panel to choose a
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
the call to a uniquely named Codex task. Switching closes the current call and
reconnects to that task; it is not seamless audio transfer. You can also choose a
task in the voice panel. Duplicate titles require choosing the task explicitly.
An existing idle Codex task is resumed without submitting a new coding prompt.

Web and desktop also expose voice actions in the command palette. The default
shortcuts are **Ctrl+Alt+V** (start/end), **Ctrl+Alt+M** (microphone mute), and
**Ctrl+Alt+S** (speaker mute); use **Cmd** instead of **Ctrl** on macOS. Web/desktop
shortcuts can be changed in keyboard settings. Mobile hardware keyboards use the
same combinations (Cmd on iOS).

Use matching updated host and client builds for these controls. Mobile hardware
shortcut changes require a new native installation, not an OTA-only update.
