# ESP-01 Wi-Fi setup

## Architecture

`AD8232 -> micro:bit -> UART -> ESP-01 -> Wi-Fi -> PC bridge -> browser`

The ESP-01 forwards ECG samples to the PC with HTTP POST. It does not run the web page.

## Wiring

### AD8232 to micro:bit

```text
AD8232 OUTPUT -> micro:bit P0
AD8232 LO+    -> micro:bit P1
AD8232 LO-    -> micro:bit P2
AD8232 3.3V   -> micro:bit 3V
AD8232 GND    -> micro:bit GND
AD8232 SDN    -> micro:bit 3V
```

### micro:bit to ESP-01

```text
micro:bit P8 (TX) -> ESP-01 RX / GPIO3
micro:bit GND      -> ESP-01 GND
ESP-01 VCC        -> stable 3.3V supply
ESP-01 EN/CH_PD   -> 3.3V
ESP-01 RST        -> 3.3V through 10K resistor
```

The ESP-01 needs a stable 3.3 V supply capable of at least 300 mA. Never connect 5 V to ESP-01 pins. Disconnect the micro:bit TX wire while flashing the ESP-01 because GPIO3 is also the ESP programming serial RX.

## Flash the ESP-01

1. Install the ESP8266 board package in Arduino IDE.
2. Select an ESP8266 generic module and upload `esp01_wifi_bridge.ino`.
3. Set `WIFI_SSID`, `WIFI_PASSWORD`, and `SERVER_URL` in the sketch.
4. Replace `192.168.1.100` with the PC's LAN IPv4 address.

## Flash the micro:bit

```python
from microbit import *

uart.init(baudrate=115200, bits=8, parity=None, stop=1, tx=pin8, rx=pin12)

while True:
    if pin1.read_digital() or pin2.read_digital():
        uart.write("Gagal\n")
    else:
        uart.write("%d\n" % pin0.read_analog())
    sleep(20)
```

## Run the PC bridge

From the project folder:

```powershell
python hardware\microbit_bridge.py --wifi-only --http-port 8080
```

Open `http://localhost:8080/`. The PC and ESP-01 must be on the same network, and Windows Firewall must allow inbound TCP port `8080` for Python.

The browser shows ECG and estimated HR only. SpO2 and respiration require their own sensors; this setup does not measure them.