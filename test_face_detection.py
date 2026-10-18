
from pathlib import Path
import cv2

BASE = Path(__file__).resolve().parent
MODEL = BASE / "models" / "face_detection_yunet_2023mar.onnx"

CAMERAS = {
    "ESP32-CAM #1": "http://192.168.1.44:81/stream",
    "ESP32-CAM #2": "http://192.168.1.42:81/stream",
}

if not MODEL.is_file():
    raise FileNotFoundError(
        f"Model not found: {MODEL}\n"
        "Download the YuNet ONNX model into the models folder."
    )

def create_detector(width, height):
    return cv2.FaceDetectorYN.create(
        str(MODEL),
        "",
        (width, height),
        0.85,
        0.3,
        5000,
    )

captures = {}

try:
    for name, url in CAMERAS.items():
        print(f"Connecting to {name}...")
        cap = cv2.VideoCapture(url)

        if not cap.isOpened():
            print(f"Could not open {name}")
            cap.release()
            continue

        captures[name] = {
            "cap": cap,
            "detector": None,
            "size": None,
        }
        print(f"Connected to {name}")

    if not captures:
        raise RuntimeError("Neither camera stream could be opened.")

    print("Face detection running. Press Q in a video window to exit.")

    while True:
        for name, item in captures.items():
            ok, frame = item["cap"].read()

            if not ok or frame is None:
                continue

            height, width = frame.shape[:2]
            size = (width, height)

            if item["detector"] is None:
                item["detector"] = create_detector(width, height)
                item["size"] = size
            elif item["size"] != size:
                item["detector"].setInputSize(size)
                item["size"] = size

            _, faces = item["detector"].detect(frame)
            count = 0 if faces is None else len(faces)

            if faces is not None:
                for face in faces:
                    x, y, w, h = map(int, face[:4])
                    cv2.rectangle(
                        frame, (x, y), (x + w, y + h),
                        (0, 255, 0), 2
                    )

            cv2.putText(
                frame,
                f"{name} | Faces: {count}",
                (15, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 0),
                2,
            )

            cv2.imshow(name, frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

except Exception as exc:
    print(f"\nFace detection error: {type(exc).__name__}: {exc}")

finally:
    for item in captures.values():
        item["cap"].release()

    cv2.destroyAllWindows()
    print("Face detection test ended.")
