// Arduino #2 — SG90 servo controller, COM11
// SG90 signal->D9, red->suitable 5V, brown/black->GND.
// Bench test only. Commands: LOCK or UNLOCK.
// Do not attach a real door latch to this test firmware.
#include <Servo.h>
Servo doorServo;
const int SERVO_PIN = 9;
void setup() {
  Serial.begin(115200);
  doorServo.attach(SERVO_PIN);
  doorServo.write(0);
  delay(500);
  Serial.println("SERVO_CONTROLLER_READY");
  Serial.println("LOCKED");
}
void loop() {
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    command.toUpperCase();
    if (command == "LOCK") {
      doorServo.write(0);
      Serial.println("LOCKED");
    } else if (command == "UNLOCK") {
      doorServo.write(90);
      Serial.println("UNLOCKED_BENCH_TEST");
    } else {
      Serial.println("ERROR_UNKNOWN_COMMAND");
    }
  }
}
