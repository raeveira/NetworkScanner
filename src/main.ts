/**
 * Example usage of NetworkScanner: scans the local network and prints discovered devices.
 */
import { NetworkScanner } from "./network-scanner.ts";

console.log("Starting ARP-based network scan...");
const devices = await NetworkScanner.scan({
  interfaceFilter: "Ethernet", // Use your actual interface name
  pingTimeout: 100,
});

if (devices.length === 0) {
  console.log(
    "No devices found. Try running as administrator and ensure your firewall allows ICMP/ARP.",
  );
} else {
  console.log(`Found ${devices.length} devices:`);
  devices.forEach((device) => {
    console.log(
      `[${device.interface.padEnd(9)}] ` +
        `${device.ip.padEnd(15)} - ` +
        `${device.mac.padEnd(17)} ` +
        `(${(device.vendor || "Unknown").padEnd(30)}) ` +
        `[${(device.name || "Unknown").padEnd(25)}]`,
    );
  });
}
