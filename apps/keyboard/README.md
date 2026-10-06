# T3 Keyboard

A standalone Android keyboard for this fork, based on [HeliBoard](https://github.com/HeliBorg/HeliBoard).
It builds its own APK and works in Android text fields, including T3 Code. It does not need a T3 server.

This app provides HeliBoard's typing, suggestions, layouts, split keyboard, and settings,
plus continuous English dictation using [Moonshine Voice](https://github.com/moonshine-ai/moonshine)
0.1.5 and its MIT-licensed open-weight streaming models. Dictation runs on the phone, independently
of T3 servers and subscriptions. It has no fixed session or silence timeout.
Glide typing requires an optional proprietary library upstream; that library is not included here.

## Dictation with Meta Ray-Bans

Requires Android 8.0 or newer. Enable T3 Keyboard as your input method, then open **On-device
dictation** in its settings (or **Setup** above the keys). Grant microphone access and, on
Android 12+, Nearby devices access. Download an English model once. Small is the default;
Tiny uses less memory and compute, while Medium prioritizes accuracy. Allow notifications to
use the notification Stop action; dictation still works if notifications are denied. Model downloads use the
network; recognition does not upload audio or text. Models are excluded from Android backup.

Pair your Ray-Bans in Android Bluetooth settings and enable their **Calls** capability. Select
**Bluetooth headset** in dictation setup. Return to a text field and tap **Dictate** or the
microphone toolbar key. Android briefly shows a startup activity, then returns you to the editor.
Wait for **Listening** and the connected device name before speaking. Tap **Stop**, including
from the notification, to finish the final phrase and release call audio.

Bluetooth dictation activates Android communication/call audio (HFP/SCO, or a supported BLE
headset), without placing a phone call. It prefers a connected device named Meta or Ray-Ban
and verifies the recorder uses that headset microphone. If headset routing fails, it stops
with an error rather than falling back to the handset. Calls must be enabled and other voice
calls ended. For handset dictation, explicitly select **Phone** in Setup.

Completed phrases are inserted into the current field; interim speech appears above the keys.
Typing, moving the cursor, switching fields, opening settings, or hiding the keyboard cancels
the session and discards unfinished speech. Password and other fields that disallow voice input
hide the dictation controls. If recognition cannot keep up, select a smaller model. Decoder
history is periodically retired, preferably between phrases, while recording continues. Long
unbroken speech may cross a forced decoder boundary. There is no stored audio recording.

You can remove a downloaded model in Setup to reclaim space or repair a failed download, then
download it again. If Android no longer presents a permission prompt, use **Android app
permissions** in Setup. Bluetooth routing is device/firmware dependent: the build and automated
routing checks do not replace a physical Z Fold / Meta Ray-Ban microphone test.

## Build

Install JDK 17 (including `javac`) and the Android SDK. Set `JAVA_HOME` and `ANDROID_HOME` for your machine;
Gradle uses Android SDK 36 and NDK `28.0.13004108`. Accept the Android SDK licenses before building.
The checked-in Gradle wrapper pins and verifies the Gradle distribution.
The optional emoji-generation tool under `tools` requires JDK 21; ordinary APK builds do not.

From the repository root:

```sh
vp run build:keyboard
```

Alternatively, run `./gradlew :app:assembleDebugNoMinify` from `apps/keyboard` without Node dependencies.

The installable debug APK is
`apps/keyboard/app/build/outputs/apk/debugNoMinify/T3Keyboard_4.1-debugNoMinify.apk`.
Install it on your phone, open **T3 Keyboard debug**, and follow the keyboard setup.
The application IDs are `com.t3tools.keyboard` and `com.t3tools.keyboard.debug`,
so it can coexist with upstream HeliBoard.

For a release build:

```sh
cd apps/keyboard
./gradlew :app:assembleRelease
```

Release builds are unsigned. Configure a private signing key before distributing a release;
never check keys or signing credentials into the repository. The keyboard has an independent
Gradle build and is not part of the web, desktop, or Expo build.

Upstream unit tests can be run with `./gradlew :app:testRunTestsUnitTest` from this directory
using a complete JDK 21; Robolectric's Android SDK 36 sandbox requires Java 21.

## Source and licenses

Imported from HeliBoard **v4.1**, commit
[`9f5bb635c2e8609dcd95dc7506c0c58fba82a52c`](https://github.com/HeliBorg/HeliBoard/tree/9f5bb635c2e8609dcd95dc7506c0c58fba82a52c).
This is an editable source snapshot, with no nested Git repository or submodule.
Upstream CI configuration, IDE configuration, and store metadata (`.github`, `.idea`, `fastlane`)
were omitted. Build sources, dictionaries, tools, tests, and license files are retained.
The original README is [README.upstream.md](README.upstream.md).

Local changes give the app a separate application ID, label, APK name, and content-provider
authorities, add local dictation, and make its test input-method fixture follow the application ID. Java/Kotlin
namespaces remain upstream's to preserve JNI bindings and keep future updates small.
The local ignore file keeps the upstream native test script trackable. Other upstream artwork,
credits, settings text, and links are preserved.

The keyboard is licensed under [GPL-3.0](LICENSE), with separately licensed AOSP code under
[Apache-2.0](LICENSE-Apache-2.0) and upstream artwork under [CC-BY-SA-4.0](LICENSE-CC-BY-SA-4.0).
Keep these licenses, per-file notices, and upstream credits. The repository's root MIT license
does not replace the licenses of this application. Distribute the corresponding keyboard source
and modifications under GPL when distributing its APK.
Moonshine runtime, English streaming weights, and dependency notices are included in
[dictation-notices.txt](app/src/main/assets/dictation-notices.txt) and accessible from Setup.
The speech runtime supports ARM64, ARMv7, and x86-64; 32-bit x86 is excluded.
