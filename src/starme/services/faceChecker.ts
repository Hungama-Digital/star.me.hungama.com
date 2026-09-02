// src/starme/services/faceChecker.ts  (guide section 14.1)
// Real on-device detector: exactly-one-face + both eyes open above 0.4 probability.
// A missing probability counts as open. On any error, fail closed.
import FaceDetection from '@react-native-ml-kit/face-detection';

export type FaceResult = { faceCount: number; eyesOpen: boolean };

// Dev override so the harness / tests can force specific gate outcomes.
let devOverride: FaceResult | null = null;
export const __setFaceCheckerOverride = (r: FaceResult | null) => {
  devOverride = r;
};

const toUri = (path: string) =>
  path.startsWith('file://') || path.startsWith('content://') ? path : `file://${path}`;

export const faceChecker = {
  async analyze(imagePath: string): Promise<FaceResult> {
    if (devOverride) return devOverride;
    try {
      const faces = await FaceDetection.detect(toUri(imagePath), {
        performanceMode: 'accurate',
        classificationMode: 'all', // needed for eye-open probabilities
        landmarkMode: 'none',
      });
      const first = faces[0];
      const left = first?.leftEyeOpenProbability ?? 1;
      const right = first?.rightEyeOpenProbability ?? 1;
      return { faceCount: faces.length, eyesOpen: !!first && left > 0.4 && right > 0.4 };
    } catch {
      return { faceCount: 0, eyesOpen: false }; // fail closed
    }
  },
};
