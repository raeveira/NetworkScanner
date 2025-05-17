import { assert, assertEquals } from "@std/assert";
import { type NetworkDevice, NetworkScanner } from "@src/network-scanner.ts";

// Get first non-loopback IPv4 interface
const interfaces = Deno.networkInterfaces().filter(
  (iface) =>
    iface.family === "IPv4" &&
    !iface.address.startsWith("127.") &&
    !iface.name.toLowerCase().includes("loopback"),
);

const ifaceName = interfaces.length > 0 ? interfaces[0].name : undefined;

Deno.test("scan returns array", async () => {
  if (!ifaceName) return; // Skip test if no suitable interface found
  const devices = await NetworkScanner.scan({
    interfaceFilter: ifaceName,
    pingTimeout: 50
  });
  assert(Array.isArray(devices));
});

Deno.test("interface filtering", async () => {
  if (!ifaceName) return; // Skip test if no suitable interface found
  const devices = await NetworkScanner.scan({
    interfaceFilter: ifaceName,
    pingTimeout: 50,
  });

  devices.forEach((device: NetworkDevice) => {
    assertEquals(device.interface, ifaceName);
  });
});
