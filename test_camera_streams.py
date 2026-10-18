
import cv2

CAMERAS = {
    "ESP32-CAM #1": "http://192.168.1.44:81/stream?t=1792253559363",
    "ESP32-CAM #2": "http://192.168.1.42:81/stream?t=1792253721735",
}

captures = {}

try:
    for name, url in CAMERAS.items():
        print(f"\nConnecting to {name}...")

        cap = cv2.VideoCapture(url)

        if not cap.isOpened():
            print(f"FAILED: Could not open {name}")
            cap.release()
            continue

        captures[name] = cap
        print(f"Connected to {name}")

    if not captures:
        print("\nNo streams opened. Check the URLs and network.")
    else:
        print("\nLive test running. Press Q in a video window to exit.")

        while True:
            for name, cap in list(captures.items()):
                ok, frame = cap.read()

                if ok and frame is not None:
                    height, width = frame.shape[:2]
                    cv2.putText(
                        frame,
                        name,
                        (15, 30),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.8,
                        (0, 255, 0),
                        2,
                    )
                    cv2.imshow(name, frame)
                else:
                    print(f"Waiting for frames from {name}...")

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

finally:
    for cap in captures.values():
        cap.release()

    cv2.destroyAllWindows()
    print("\nCamera test ended.")
