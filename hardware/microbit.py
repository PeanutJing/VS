from microbit import *

uart.init(baudrate=115200, bits=8, parity=None, stop=1, tx=pin8, rx=pin12)

while True:
    if pin1.read_digital() or pin2.read_digital():
        uart.write("Gagal\n")
    else:
        uart.write("%d\n" % pin0.read_analog())

    sleep(20)