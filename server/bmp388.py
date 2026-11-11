"""BMP388 (and BMP390) I2C barometric pressure driver -- v1.0.0 (russ 11/11).

Replaces the retired in-vessel atmospheric capture: a dedicated Bosch BMP388
on the Pi's I2C bus (GPIO2/3, /dev/i2c-1, address 0x77 or 0x76) feeds
atmPressRef continuously (server _baro_task). +/-8 Pa relative accuracy
(~0.001 psi); absolute spec +/-50 Pa (~0.007 psi).

Pure smbus2; compensation is the Bosch BMP3 reference driver's floating-point
form (datasheet section 9.3). Self-contained: probe() returns a ready device
or None -- the server treats None as 'no barometer fitted' and stays silent.

UNTESTED ON SILICON until the sensor lands (Monday): every read is wrapped,
and the server additionally sanity-bands the result before it touches
atmPressRef, so a wiring or math surprise cannot poison the reference.
"""

VERSION = "1.0.0"

_REG_CHIP_ID = 0x00
_REG_DATA    = 0x04   # press xlsb,lsb,msb then temp xlsb,lsb,msb
_REG_PWR_CTRL = 0x1B
_REG_OSR     = 0x1C
_REG_ODR     = 0x1D
_REG_CONFIG  = 0x1F
_REG_CALIB   = 0x31   # 21 bytes
_REG_CMD     = 0x7E

_CHIP_IDS = {0x50: "BMP388", 0x60: "BMP390"}


def _s8(v):  return v - 256 if v > 127 else v
def _s16(v): return v - 65536 if v > 32767 else v


class BMP388:
    def __init__(self, bus, addr):
        self.bus = bus
        self.addr = addr
        self.chip = _CHIP_IDS.get(self._r8(_REG_CHIP_ID), None)
        if self.chip is None:
            raise IOError("no BMP388/390 at 0x%02X" % addr)
        self._soft_reset()
        self._load_calib()
        # x8 pressure / x1 temp oversampling, 12.5 Hz ODR, IIR coef 15:
        # a barometer wants smooth and slow -- the server polls ~0.5 Hz.
        self._w8(_REG_OSR, 0x03)        # osr_p=x8 (bits 2:0), osr_t=x1 (bits 5:3)
        self._w8(_REG_ODR, 0x04)        # 12.5 Hz
        self._w8(_REG_CONFIG, 0x04 << 1)  # iir_filter coef 15
        self._w8(_REG_PWR_CTRL, 0x33)   # press_en | temp_en | normal mode

    # ---- low level ----
    def _r8(self, reg):
        return self.bus.read_byte_data(self.addr, reg)

    def _w8(self, reg, val):
        self.bus.write_byte_data(self.addr, reg, val)

    def _soft_reset(self):
        import time
        try:
            self._w8(_REG_CMD, 0xB6)
        except OSError:
            pass
        time.sleep(0.01)

    def _load_calib(self):
        c = self.bus.read_i2c_block_data(self.addr, _REG_CALIB, 21)
        t1 = c[0] | (c[1] << 8)
        t2 = c[2] | (c[3] << 8)
        t3 = _s8(c[4])
        p1 = _s16(c[5] | (c[6] << 8))
        p2 = _s16(c[7] | (c[8] << 8))
        p3 = _s8(c[9])
        p4 = _s8(c[10])
        p5 = c[11] | (c[12] << 8)
        p6 = c[13] | (c[14] << 8)
        p7 = _s8(c[15])
        p8 = _s8(c[16])
        p9 = _s16(c[17] | (c[18] << 8))
        p10 = _s8(c[19])
        p11 = _s8(c[20])
        # Bosch reference floating-point scaling (bmp3.c parse_calib_data)
        self.par_t1 = t1 * 256.0
        self.par_t2 = t2 / 2.0 ** 30
        self.par_t3 = t3 / 2.0 ** 48
        self.par_p1 = (p1 - 2.0 ** 14) / 2.0 ** 20
        self.par_p2 = (p2 - 2.0 ** 14) / 2.0 ** 29
        self.par_p3 = p3 / 2.0 ** 32
        self.par_p4 = p4 / 2.0 ** 37
        self.par_p5 = p5 * 8.0
        self.par_p6 = p6 / 2.0 ** 6
        self.par_p7 = p7 / 2.0 ** 8
        self.par_p8 = p8 / 2.0 ** 15
        self.par_p9 = p9 / 2.0 ** 48
        self.par_p10 = p10 / 2.0 ** 48
        self.par_p11 = p11 / 2.0 ** 65

    # ---- reading ----
    def read(self):
        """Return (pressure_Pa, temp_C) or raise OSError."""
        d = self.bus.read_i2c_block_data(self.addr, _REG_DATA, 6)
        raw_p = d[0] | (d[1] << 8) | (d[2] << 16)
        raw_t = d[3] | (d[4] << 8) | (d[5] << 16)
        # temperature (datasheet 9.3.1)
        pd1 = raw_t - self.par_t1
        pd2 = pd1 * self.par_t2
        t_lin = pd2 + (pd1 * pd1) * self.par_t3
        # pressure (datasheet 9.3.2)
        po1 = (self.par_p5 + self.par_p6 * t_lin
               + self.par_p7 * t_lin ** 2 + self.par_p8 * t_lin ** 3)
        po2 = raw_p * (self.par_p1 + self.par_p2 * t_lin
                       + self.par_p3 * t_lin ** 2 + self.par_p4 * t_lin ** 3)
        pd4 = (raw_p ** 2) * (self.par_p9 + self.par_p10 * t_lin) \
            + (raw_p ** 3) * self.par_p11
        return po1 + po2 + pd4, t_lin

    def read_psi(self):
        """Return (pressure_psia, temp_C)."""
        pa, t = self.read()
        return pa / 6894.757293168, t


def probe(busnum=1):
    """Find a BMP388/390 on the bus. Returns a ready BMP388 or None (quiet)."""
    try:
        from smbus2 import SMBus
    except ImportError:
        try:
            from smbus import SMBus  # type: ignore
        except ImportError:
            return None
    try:
        bus = SMBus(busnum)
    except (OSError, FileNotFoundError):
        return None
    for addr in (0x77, 0x76):
        try:
            return BMP388(bus, addr)
        except OSError:
            continue
    try:
        bus.close()
    except OSError:
        pass
    return None


if __name__ == "__main__":
    dev = probe()
    if dev is None:
        print("no BMP388/390 found on i2c-1 (0x77/0x76)")
    else:
        import time
        print(f"{dev.chip} at 0x{dev.addr:02X}")
        time.sleep(0.2)
        for _ in range(5):
            psi, t = dev.read_psi()
            print(f"{psi:.4f} psia  ({psi/0.4911542:.2f} inHg)  {t:.2f} C")
            time.sleep(0.5)
