
from pathlib import Path
import cv2

BASE = Path(__file__).resolve().parent
MODELS = BASE / "models"

YUNET = MODELS / "face_detection_yunet_2023mar.onnx"
SFACE = MODELS / "face_recognition_sface_2021dec.onnx"

CAMERA_URL = "http://192.168.1.44:81/stream"

for model in (YUNET, SFACE):
    if not model.is_file():
        raise FileNotFoundError(f"Model missing: {model}")

detector = cv2.FaceDetectorYN.create(
    str(YUNET), "", (320, 320), 0.85, 0.3, 5000
)
recognizer = cv2.FaceRecognizerSF.create(str(SFACE), "")

cap = cv2.VideoCapture(CAMERA_URL)
if not cap.isOpened():
    raise RuntimeError("Could not open ESP32-CAM #1 stream.")

reference = None
probe = None

print("Press R to capture reference face.")
print("Press T to capture second face.")
print("Press Q to quit.")

try:
    while True:
        ok, frame = cap.read()
        if not ok or frame is None:
            print("No camera frame received.")
            break

        cv2.putText(
            frame, "R: reference | T: second image | Q: quit",
            (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
            (0, 255, 0), 2
        )
        cv2.imshow("SFace matching test", frame)
        key = cv2.waitKey(1) & 0xFF

        if key == ord("q"):
            break

        if key in (ord("r"), ord("t")):
            height, width = frame.shape[:2]
            detector.setInputSize((width, height))
            _, faces = detector.detect(frame)

            if faces is None or len(faces) == 0:
                print("No face detected. Try again in better lighting.")
                continue

            # Use the highest-confidence detected face.
            face = max(faces, key=lambda f: f[14])
            aligned = recognizer.alignCrop(frame, face)
            features = recognizer.feature(aligned)

            if key == ord("r"):
                reference = features.copy()
                print("Reference captured.")
            else:
                probe = features.copy()
                print("Second image captured.")

        if reference is not None and probe is not None:
            score = recognizer.match(
                reference, probe, cv2.FaceRecognizerSF_FR_COSINE
            )
            print(f"Cosine similarity score: {float(score):.4f}")
            print("Higher scores indicate greater similarity.")
            print("This score alone is NOT an access decision.")

            reference = None
            probe = None
            print("Ready for another pair. Press R, then T.")

finally:
    cap.release()
    cv2.destroyAllWindows()
