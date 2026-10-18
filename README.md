SMARTDOOR PC CONTROL CENTER

START THE LOCAL DASHBOARD
1. Extract this folder.
2. Open Command Prompt in this folder.
3. Install the serial package: py -m pip install pyserial
4. Close Arduino IDE Serial Monitor for COM10/COM11.
5. Start the app: py smartdoor_pc.py
6. Open http://127.0.0.1:8765/ and click Open dashboard.

The Python server listens on this PC only (127.0.0.1). Camera streams are
displayed directly by the browser; no OpenCV install is required.
It also refuses requests from other websites or with a spoofed Host header, so a
web page you visit cannot move the servo behind your back.

USING THE DASHBOARD
- Tabs: Live (cameras + quick actions), Hardware (Arduinos), Events (log).
- Press Ctrl+K and type a command: "connect cameras", "lock", "events", "theme"...
- The bell counts motion alerts since you last clicked it.
- Camera URLs you edit are remembered in this browser.

CONFIRMED CAMERA STREAM ENDPOINTS
Camera #1: http://192.168.0.101:81/stream
Camera #2: http://192.168.0.102:81/stream
The ?t=... suffix in copied links is a changing timestamp/cache value and is
not needed. These URLs can be edited in the dashboard. PC and cameras must be
connected to the same network.

ARDUINO ASSIGNMENTS
- Arduino #1: PIR sensor, COM10 by default, HC-SR501 OUT to D2.
- Arduino #2: SG90 servo, COM11 by default, signal to D9.
- PIR sketch reports MOTION DETECTED / No motion at 115200 baud. It ignores the
  sensor for the first 30 s (HC-SR501 warm-up) and prints PIR_WARMING_UP / PIR_READY.
- Servo sketch accepts LOCK (0 degrees) / UNLOCK (90 degrees).
- Select the actual COM port in the dashboard if Windows assigned another one.

SAFETY / LIMITATIONS
- Face recognition is not implemented.
- Motion never unlocks the door.
- Servo buttons are for an unloaded bench test only.
- Do not connect this prototype to a real door lock or rely on it for security.
- If the servo causes resets or USB dropouts, use a suitable regulated 5V servo
  supply and connect its ground to Uno GND. Do not connect external +5V to Uno
  5V while the Uno is USB-powered.


FACE-API.JS BROWSER TEST (FEATURE BRANCH)
1. Start the local app with `py smartdoor_pc.py` and open `http://127.0.0.1:8765/`.
2. On the Live tab, set Camera #1 to the current ESP32-CAM stream URL (for this setup: `http://192.168.1.44:81/stream`) and connect it.
3. Open Hardware → Face recognition. Internet access is needed to load the face-api.js library and model weights on first load.
4. Wait for MODEL READY, choose Entry camera, then Start analysis.
5. Enter a consenting test user's name and click Register current face while the face is visible.
6. Test the same user and other consenting test users in varied lighting. Use Clear registrations to remove descriptors stored in this browser.
7. Recognition results and face events are for evaluation only. Face matching does not send servo commands; the existing servo controls remain manual bench-test controls.

This feature branch adds a local stream relay restricted to private-network ESP32-CAM URLs on port 81 and a browser-side face-api.js test panel. The initial 0.600 descriptor-distance cutoff is only a prototype starting point and must be evaluated on labelled samples; it is not a security guarantee. The prototype does not implement liveness detection and must not be used as the sole security control for a real door.
