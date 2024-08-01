# Bluetooth SoC simulator for E360AP CT meter

This tool simulate a SoC which connects to the meter via an uart and implemented the Bluetooth LE stack.

## Usage

```
btsim.js [command]

Commands:
  btsim.js send-data  send data
  btsim.js send-cmd   send command
  btsim.js setup      setup

Options:
      --version  Show version number                                   [boolean]
  -d, --device                                               [string] [required]
  -b, --baud                                          [number] [default: 921600]
      --help     Show help                                             [boolean]

```
