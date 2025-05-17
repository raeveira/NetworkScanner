
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

## Testing

All tests are located in the `tests/` directory.

- **Unit and integration tests** are written using Deno’s standard test API.
- Tests cover:
  - Network scanning logic
  - Interface filtering
  - Device enrichment and OUI vendor lookup

### Running the Tests

From the project root, run:

```bash
deno test --allow-net --allow-run --allow-sys --allow-read
```

Or use the Deno task:

```bash
deno task test
```

### Adding New Tests

- Place new test files in the `tests/` directory.
- Name test files with the `_test.ts` suffix (e.g., `network-scanner_test.ts`).
- See the existing test files for examples.

---

## Documentation

- **`network-scanner.ts`**  
  Main scanner logic with detailed JSDoc comments for all classes and methods.

- **`main.ts`**  
  Example usage and pretty output formatting.

- **`ouis.json`**  
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
