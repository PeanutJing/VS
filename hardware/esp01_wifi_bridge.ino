#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>

const char* WIFI_SSID = "vivo V60";
const char* WIFI_PASSWORD = "12345678";
const char* SERVER_URL = "http://10.10.67.31:8080/api/telemetry";

WiFiClient wifiClient;
String inputLine;

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void forwardLine(const String& line) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }

  HTTPClient http;
  if (!http.begin(wifiClient, SERVER_URL)) {
    return;
  }
  http.addHeader("Content-Type", "application/json");

  String body;
  if (line.equalsIgnoreCase("Gagal")) {
    body = "{\"leadOff\":true}";
  } else {
    body = "{\"ecg\":" + line + ",\"leadOff\":false}";
  }
  http.POST(body);
  http.end();
}

void setup() {
  Serial.begin(115200);
  connectWifi();
}

void loop() {
  while (Serial.available()) {
    char character = static_cast<char>(Serial.read());
    if (character == '\n') {
      inputLine.trim();
      if (inputLine.length() > 0) {
        forwardLine(inputLine);
      }
      inputLine = "";
    } else {
      inputLine += character;
    }
  }
  delay(2);
}