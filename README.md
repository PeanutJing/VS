# VS

from microbit import *

uart.init(
    baudrate=115200,
    bits=8,
    parity=None,
    stop=1,
    tx=pin8,
    rx=pin12
)

fail_count = 0
FAIL_LIMIT = 50  # 500 ms at sleep(10)

while True:
    lead_off = pin1.read_digital() == 1 or pin2.read_digital() == 1

    if lead_off:
        fail_count = min(fail_count + 1, FAIL_LIMIT)
    else:
        fail_count = 0

    if fail_count >= FAIL_LIMIT:
        uart.write("Gagal\n")
    else:
        uart.write("%d\n" % pin0.read_analog())

    sleep(10)
