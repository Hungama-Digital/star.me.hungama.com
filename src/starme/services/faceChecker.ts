// src/starme/services/faceChecker.ts  (guide section 14.1)
// Real on-device detector: exactly-one-face, the face must be a REAL, sizeable face
// (not a tiny false-positive speckle), and both eyes open above 0.4 probability.
// A missing probability counts as open. On any error, fail closed.
import { Image } from 'react-native';
import FaceDetection from '@react-native-ml-kit/face-detection';

export type FaceResult = { faceCount: number; eyesOpen: boolean };

// A detected face must be at least this fraction of the image on each axis. ML Kit
// happily reports ~2%-wide "faces" inside textures/patterns (water, foliage, posters);
// a genuine close-up face fills far more than this, so it filters the false positives.
const MIN_FACE_FRACTION = 0.15;

// Dev override so the harness / tests can force specific gate outcomes.
let devOverride: FaceResult | null = null;
export const __setFaceCheckerOverride = (r: FaceResult | null) => {
  devOverride = r;
};

const toUri = (path: string) =>
  path.startsWith('file://') || path.startsWith('content://') ? path : `file://${path}`;

const getImageSize = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });

export const faceChecker = {
  async analyze(imagePath: string): Promise<FaceResult> {
    if (devOverride) return devOverride;
    try {
      const uri = toUri(imagePath);
      const faces = await FaceDetection.detect(uri, {
        performanceMode: 'accurate',
        classificationMode: 'all', // needed for eye-open probabilities
        landmarkMode: 'none',
        minFaceSize: MIN_FACE_FRACTION, // ask ML Kit to ignore very small faces too
      });

      // Must be exactly one face.
      if (faces.length !== 1) return { faceCount: faces.length, eyesOpen: false };

      const first = faces[0];
      const frame = (first.frame ?? {}) as { width?: number; height?: number };

      // Reject false-positive tiny "faces": the box must be a real portion of the image.
      const dims = await getImageSize(uri).catch(() => null);
      if (dims && frame.width && frame.height) {
        const relW = frame.width / dims.width;
        const relH = frame.height / dims.height;
        if (relW < MIN_FACE_FRACTION || relH < MIN_FACE_FRACTION) {
          return { faceCount: 0, eyesOpen: false }; // treat as "no usable face"
        }
      }

      const left = first.leftEyeOpenProbability ?? 1;
      const right = first.rightEyeOpenProbability ?? 1;
      return { faceCount: 1, eyesOpen: left > 0.4 && right > 0.4 };
    } catch {
      return { faceCount: 0, eyesOpen: false }; // fail closed
    }
  },
};
