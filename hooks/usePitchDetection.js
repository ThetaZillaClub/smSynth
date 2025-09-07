// hooks/usePitchDetection.js
import useSwiftF0PitchDetection from './useSwiftF0PitchDetection';

export default function usePitchDetection(modelBaseUrl = '/models/swiftf0', opts = {}) {
  // Force SwiftF0; no engine switching, no CREPE
  return useSwiftF0PitchDetection(modelBaseUrl, { ...opts });
}
