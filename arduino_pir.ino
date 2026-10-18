// Arduino #1 — PIR controller, COM10
// HC-SR501 VCC->5V, OUT->D2, GND->GND.
// Motion reports only; never unlocks the servo.
// The HC-SR501 gives false triggers for ~30-60 s after power-up, so reports start after a warm-up.
const int PIR_PIN = 2;
const unsigned long WARMUP_MS = 30000;
void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN, INPUT);
  delay(1000);
  Serial.println("PIR_CONTROLLER_READY");
  Serial.println("PIR_WARMING_UP");
}
void loop() {
  static int previousState = -1;
  static bool warmedUp = false;
  if (!warmedUp) {
    if (millis() < WARMUP_MS) {
      delay(50);
      return;
    }
    warmedUp = true;
    Serial.println("PIR_READY");
  }
  int state = digitalRead(PIR_PIN);
  if (state != previousState) {
    Serial.println(state == HIGH ? "MOTION DETECTED" : "No motion");
    previousState = state;
  }
  delay(50);
}
