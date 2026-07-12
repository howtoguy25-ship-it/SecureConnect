require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'YamnetSiren'
  s.version        = package['version']
  s.summary        = 'On-device YAMNet siren classification for SecureConnect EV Radar.'
  s.author         = 'SecureConnect'
  s.homepage       = 'https://github.com/howtoguy25-ship-it/secureconnect'
  s.platform       = :ios, '13.0'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # TODO (README.md step 4): s.dependency 'TensorFlowLiteSwift'

  s.source_files = '**/*.{h,m,mm,swift}'
end
