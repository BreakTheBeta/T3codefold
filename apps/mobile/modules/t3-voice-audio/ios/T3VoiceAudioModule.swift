import ExpoModulesCore
import AVFoundation
import WebRTC

public class T3VoiceAudioModule: Module {
  public func definition() -> ModuleDefinition {
    Name("T3VoiceAudio")
    Events("endCall", "audioRoute", "systemMute")
    AsyncFunction("connected") {}
    AsyncFunction("start") { () -> Bool in
      let session = RTCAudioSession.sharedInstance()
      session.lockForConfiguration()
      defer { session.unlockForConfiguration() }
      try session.setCategory(AVAudioSession.Category.playAndRecord.rawValue,
                              with: [.allowBluetooth, .defaultToSpeaker])
      try session.setMode(AVAudioSession.Mode.voiceChat.rawValue)
      try session.setActive(true)
      return AVAudioSession.sharedInstance().currentRoute.outputs.contains { $0.portType == .builtInSpeaker }
    }
    AsyncFunction("setSpeaker") { (enabled: Bool) in
      let session = RTCAudioSession.sharedInstance()
      session.lockForConfiguration()
      defer { session.unlockForConfiguration() }
      try session.setCategory(AVAudioSession.Category.playAndRecord.rawValue,
                              with: enabled ? [.allowBluetooth, .defaultToSpeaker] : [.allowBluetooth])
      try session.overrideOutputAudioPort(enabled ? .speaker : .none)
    }
    AsyncFunction("stop") {
      let session = RTCAudioSession.sharedInstance()
      session.lockForConfiguration()
      defer { session.unlockForConfiguration() }
      try session.overrideOutputAudioPort(.none)
      try session.setActive(false)
    }
  }
}
