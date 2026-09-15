Pod::Spec.new do |s|
  s.name = 'T3VoiceAudio'
  s.version = '1.0.0'
  s.summary = 'Call audio routing for T3 voice.'
  s.description = s.summary
  s.author = 'T3 Tools'
  s.homepage = 'https://t3.codes'
  s.platforms = { :ios => '18.0' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'JitsiWebRTC'
  s.source_files = '**/*.swift'
end
