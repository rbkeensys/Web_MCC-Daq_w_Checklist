#!/usr/bin/env python3
"""Raspberry Pi bench-verify for the MCC Ethernet DAQs via uldaq.

Standalone -- does NOT import the app. Verifies each hardware subsystem
before you trust the server with a live boiler.

  python bench_daq_test.py              # discovery + AI snapshot + TC snapshot
  python bench_daq_test.py --do 3       # blink E-1608 DO bit 3 (5x, 0.5s)
  python bench_daq_test.py --ao 0 2.5   # set E-1608 AO channel 0 to 2.5 V
  python bench_daq_test.py --ctr        # stream CTR0 counts for 10 s
"""
import sys, time, argparse

try:
    from uldaq import (get_daq_device_inventory, DaqDevice, InterfaceType,
                       AiInputMode, Range, AInFlag, AOutFlag, DigitalDirection,
                       TempScale)
    try:
        from uldaq import TInFlags
    except ImportError:
        from uldaq import TInFlag as TInFlags
except Exception as e:
    sys.exit(f"uldaq import failed ({e}) -- run pi_port/install.sh first")


def discover():
    inv = get_daq_device_inventory(InterfaceType.ETHERNET) or []
    if not inv:
        inv = get_daq_device_inventory(InterfaceType.ANY) or []
    print(f"discovered {len(inv)} device(s):")
    for i, d in enumerate(inv):
        print(f"  [{i}] {d.product_name}  unique_id={getattr(d, 'unique_id', '?')}")
    return inv


def open_first(inv, substr):
    matches = sorted((d for d in inv if substr.lower() in str(d.product_name).lower()),
                     key=lambda d: str(getattr(d, "unique_id", "")))
    if not matches:
        print(f"  (no {substr} found)")
        return None
    dev = DaqDevice(matches[0])
    dev.connect()
    print(f"connected: {matches[0].product_name}")
    return dev


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--do", type=int, help="blink this E-1608 DO bit")
    ap.add_argument("--ao", nargs=2, type=float, metavar=("CH", "VOLTS"))
    ap.add_argument("--ctr", action="store_true", help="stream CTR0 counts 10s")
    args = ap.parse_args()

    inv = discover()

    e1608 = open_first(inv, "E-1608")
    if e1608:
        ai = e1608.get_ai_device()
        if args.do is not None:
            dio = e1608.get_dio_device()
            port = dio.get_info().get_port_types()[0]
            dio.d_config_bit(port, args.do, DigitalDirection.OUTPUT)
            print(f"blinking DO{args.do} (watch the relay/LED)...")
            for _ in range(5):
                dio.d_bit_out(port, args.do, 1); time.sleep(0.5)
                dio.d_bit_out(port, args.do, 0); time.sleep(0.5)
        elif args.ao:
            ch, v = int(args.ao[0]), max(-10.0, min(10.0, args.ao[1]))
            e1608.get_ao_device().a_out(ch, Range.BIP10VOLTS, AOutFlag.DEFAULT, v)
            print(f"AO{ch} = {v} V (meter it; rerun with 0 to clear)")
        elif args.ctr:
            ctr = e1608.get_ctr_device()
            ctr.c_clear(0)
            print("CTR0 counts for 10 s (pulse the meter):")
            t0 = time.time()
            while time.time() - t0 < 10:
                print(f"  t={time.time()-t0:4.1f}s  count={ctr.c_in(0)}")
                time.sleep(1)
        else:
            vals = [ai.a_in(ch, AiInputMode.SINGLE_ENDED, Range.BIP10VOLTS,
                            AInFlag.DEFAULT) for ch in range(8)]
            print("AI snapshot (V):", [f"{v:+.4f}" for v in vals])
        e1608.disconnect()

    etc = open_first(inv, "E-TC")
    if etc and args.do is None and not args.ao and not args.ctr:
        tdev = etc.get_temp_device()
        temps = []
        for ch in range(8):
            try:
                temps.append(f"{tdev.t_in(ch, TempScale.CELSIUS, TInFlags.DEFAULT):.2f}")
            except Exception as e:
                temps.append("open" if "open" in str(e).lower() else "err")
        print("TC snapshot (C):", temps)
    if etc:
        etc.disconnect()


if __name__ == "__main__":
    main()
