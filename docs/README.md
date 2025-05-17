# Deno ARP Network Scanner

![Deno](https://img.shields.io/badge/Deno-%23007ACC.svg?style=for-the-badge&logo=deno&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Cross-platform](https://img.shields.io/badge/os-Windows%20%7C%20Linux%20%7C%20macOS-blue?style=for-the-badge)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)
![OUI Vendor DB](https://img.shields.io/badge/OUI%20vendor%20db-IEEE%20JSON-blue?style=for-the-badge)
![ICMP/ARP Scan](https://img.shields.io/badge/Scan-ARP%20%26%20ICMP-green?style=for-the-badge)

A fast, cross-platform local network scanner written in TypeScript for [Deno](https://deno.com/).

It discovers all active devices on your LAN by leveraging ARP, ICMP pings, and MAC address vendor lookups.  
The scanner enriches device information with vendor names (from the official IEEE OUI database) and attempts to resolve device names using multiple protocols.

---

## Features

- **Discovers all devices on your local subnet** (using ARP and ICMP ping)
- **Vendor identification** via MAC address OUI (using a local `ouis.json` database)
- **Attempts device name resolution** (NetBIOS, mDNS/Bonjour, UPnP, reverse DNS, DHCP leases)
- **Works on Windows, Linux, and macOS**
- **Batch scanning for speed**
- **Thorough logging and pretty output**
- **Well-documented, type-safe code**

---

## Quick Start

1. **Install Deno:**  
   [https://deno.com/manual/getting_started/installation](https://deno.com/manual/getting_started/installation)

2. **Clone or download this repository.**

3. **Download the OUI database:**  

```bash
# Change to the data directory (dont forget /data at the end)
cd /path/to/your/repo/data

# Download the latest OUI database
curl -o ouis.json https://raw.githubusercontent.com/jfisbein/ouidb-json/master/ouidb.json
```

4. **Install the dependencies:**

```bash
deno install
```

5. **Run the scanner:**  

```bash
deno run --watch --v8-flags="--max-old-space-size=4096" --allow-net --allow-run --allow-sys --allow-read src/main.ts
```

Or, if you use Deno tasks:

```bash
deno task dev
```

- On Windows, run your terminal as administrator for best results.

---

## Usage

You can filter by interface name and set ping timeout:

```ts
import { NetworkScanner } from "./network-scanner.ts";

const devices = await NetworkScanner.scan({
    interfaceFilter: "Ethernet", // Optional: only scan this interface
    pingTimeout: 100, // Optional: ms per ping
});

devices.forEach(device => {
    console.log(
    [${device.interface.padEnd(9)}] ${device.ip.padEnd(15)} - ${device.mac.padEnd(17)} (${(device.vendor || "Unknown").padEnd(30)}) [${(device.name || "Unknown").padEnd(25)}]
    );
});
```

---

## Testing

Automated tests are provided using Deno’s built-in test runner.

To run all tests, use:
```bash
deno test --allow-read --allow-write --allow-net --allow-sys --allow-run

```

Or, if you use Deno tasks:
```bash
deno task test
```

---

## How It Works

1. **Subnet Discovery:**  
   The scanner determines your local subnet(s) using Deno’s network interface API.

2. **ICMP Ping Sweep:**  
   It pings every possible host in the subnet to populate your OS’s ARP cache.

3. **ARP Table Parsing:**  
   It reads the system ARP table (`arp -a`) to find all responding devices and their MAC addresses.

4. **Vendor Lookup:**  
   The scanner matches the MAC OUI (first 6 hex digits) against the local `ouis.json` database to identify the manufacturer.

5. **Device Name Resolution:**  
   It attempts to resolve a human-friendly device name using:
   - NetBIOS (Windows)
   - mDNS/Bonjour (Apple/Linux)
   - UPnP (smart devices)
   - Reverse DNS
   - DHCP leases (Linux)

6. **Output:**  
   Results are logged in a neat, column-aligned table for easy reading.

---

## Documentation

- **`src/network-scanner.ts`**  
  Main scanner logic with detailed JSDoc comments for all classes and methods.

- **`src/main.ts`**  
  Example usage and pretty output formatting.

- **`data/ouis.json`**  
  OUI vendor database. Download the latest from the [official source](https://github.com/jfisbein/ouidb-json).

---

## Troubleshooting

- **No devices found?**  
  - Run as administrator (especially on Windows)
  - Ensure your firewall allows ICMP (ping) and ARP
  - Make sure you have the correct interface name (see Deno.networkInterfaces())

- **Some devices show "Unknown" for vendor or name?**  
  - The OUI database may not have every vendor (but covers 99%+ of consumer hardware)
  - Many IoT devices do not advertise a name

---

## License

MIT

---

**Happy scanning!**
