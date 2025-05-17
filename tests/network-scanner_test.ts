// tests/network-scanner_test.ts
import { assert, assertEquals } from "@std/assert";
import { NetworkScanner, type NetworkDevice } from "@src/network-scanner.ts";

Deno.test("scan returns array", async () => {
  const devices = await NetworkScanner.scan({ pingTimeout: 50 });
  assert(Array.isArray(devices));
});

Deno.test("interface filtering", async () => {
  const interfaces = Deno.networkInterfaces();
  if (interfaces.length === 0) return;

  const ifaceName = interfaces[0].name;
  const devices = await NetworkScanner.scan({
    interfaceFilter: ifaceName,
    pingTimeout: 50
  });

  devices.forEach((device: NetworkDevice) => {
    assertEquals(device.interface, ifaceName);
  });
});
