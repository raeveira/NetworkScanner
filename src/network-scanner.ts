/**
 * Represents a discovered network device.
 */
export interface NetworkDevice {
  ip: string; // IPv4 address of the device
  mac: string; // MAC address of the device
  interface: string; // Network interface name
  vendor?: string; // Vendor name derived from MAC OUI
  name?: string; // Resolved device name (NetBIOS, mDNS, etc.)
}

/**
 * Options for scanning the network.
 */
interface ScanOptions {
  interfaceFilter?: string; // Only scan this network interface (optional)
  pingTimeout?: number; // Timeout (ms) for each ping attempt (optional)
}

/**
 * Entry from the OUI database.
 */
interface OuiEntry {
  prefix: string; // OUI prefix (first 6 hex digits of MAC, uppercase, no separators)
  organization: {
    name: string; // Organization name
  };
}

/**
 * NetworkScanner provides static methods for discovering devices on local networks.
 * It uses ARP, ICMP, and vendor lookups for device enrichment.
 */
export class NetworkScanner {
  /** OUI vendor lookup table. Loaded from ouis.json. */
  private static ouiDatabase: Record<string, string> | null = null;

  /**
   * Scan the local network for devices.
   * @param options - Scan options (interface filter, ping timeout)
   * @returns Promise resolving to an array of discovered devices
   */
  public static async scan(
    options: ScanOptions = {},
  ): Promise<NetworkDevice[]> {
    console.log("[Scanner] Loading OUI database...");
    if (!this.ouiDatabase) {
      this.ouiDatabase = await this.loadOuiDatabase();
      console.log(
        `[Scanner] Loaded ${Object.keys(this.ouiDatabase).length} OUIs.`,
      );
    }

    const interfaces = Deno.networkInterfaces();
    console.log(`[Scanner] Found ${interfaces.length} network interfaces.`);

    const results: NetworkDevice[] = [];

    for (const iface of interfaces) {
      console.log(
        `[Scanner] Checking interface: ${iface.name} (${iface.address})`,
      );
      if (options.interfaceFilter && iface.name !== options.interfaceFilter) {
        console.log(
          `[Scanner] Skipping interface ${iface.name} (filter applied).`,
        );
        continue;
      }
      if (iface.family !== "IPv4") {
        console.log(`[Scanner] Skipping interface ${iface.name} (not IPv4).`);
        continue;
      }

      console.log(
        `[Scanner] Pinging subnet for interface: ${iface.name} (${iface.cidr})...`,
      );
      await this.pingSubnet(
        iface.address,
        iface.netmask,
        options.pingTimeout ?? 100,
      );
      console.log("[Scanner] Finished pinging subnet.");

      console.log("[Scanner] Reading ARP cache...");
      const arpCache = await this.getArpCache();
      console.log(`[Scanner] ARP cache contains ${arpCache.size} entries.`);

      if (arpCache.size === 0) {
        console.warn(
          "[Scanner] ARP cache is empty. Ensure you have permissions.",
        );
        continue;
      }

      console.log("[Scanner] Filtering devices in the subnet...");
      const subnetDevices = this.filterSubnetDevices(
        arpCache,
        iface.address,
        iface.netmask,
      );
      console.log(
        `[Scanner] Found ${subnetDevices.length} devices in the subnet.`,
      );

      if (subnetDevices.length === 0) {
        console.warn("[Scanner] No devices found in the subnet.");
        continue;
      }

      console.log("[Scanner] Enriching device information...");
      const enriched = await this.enrichDevices(subnetDevices, iface.name);
      enriched.forEach((d, idx) =>
        console.log(
          `[Enrich] [${String(idx + 1).padStart(2)}] ` +
            `${d.ip.padEnd(15)} | ` +
            `MAC: ${d.mac.padEnd(17)} | ` +
            `OUI: ${d.mac.replace(/:/g, "").slice(0, 6).padEnd(6)} | ` +
            `Vendor: ${(d.vendor || "Unknown").padEnd(30)} | ` +
            `Name: ${(d.name || "Unknown").padEnd(25)}`,
        )
      );
      results.push(...enriched);
    }

    console.log(
      `[Scanner] Scan complete. Total devices found: ${results.length}`,
    );
    return results;
  }

  /**
   * Loads the OUI database from ouis.json and returns a lookup table.
   * @returns Promise resolving to a record mapping OUI prefixes to vendor names
   */
  private static async loadOuiDatabase(): Promise<Record<string, string>> {
    try {
      const json = await Deno.readTextFile("./data/ouis.json");
      const ouiEntries = JSON.parse(json) as OuiEntry[];
      console.log(`[OUI] Loaded ${ouiEntries.length} entries from ouis.json`);
      return ouiEntries.reduce((acc, entry) => {
        acc[entry.prefix.toUpperCase()] = entry.organization.name;
        return acc;
      }, {} as Record<string, string>);
    } catch (error) {
      console.error("[OUI] Error loading OUI database:", error);
      return {};
    }
  }

  /**
   * Yields all host IPs in the subnet, excluding network and broadcast.
   * @param ip - IP address of the interface
   * @param netmask - Netmask of the interface
   */
  private static *calculateSubnet(
    ip: string,
    netmask: string,
  ): Generator<string> {
    const ipNum = ip.split(".").reduce(
      (acc, octet) => (acc << 8) | parseInt(octet),
      0,
    );
    const maskNum = netmask.split(".").reduce(
      (acc, octet) => (acc << 8) | parseInt(octet),
      0,
    );
    const network = ipNum & maskNum;
    const broadcast = network | (~maskNum >>> 0);

    for (let current = network + 1; current < broadcast; current++) {
      yield [
        (current >>> 24) & 0xff,
        (current >>> 16) & 0xff,
        (current >>> 8) & 0xff,
        current & 0xff,
      ].join(".");
    }
  }

  /**
   * Pings all IPs in the subnet to populate the ARP cache.
   * @param ip - IP address of the interface
   * @param netmask - Netmask of the interface
   * @param timeout - Timeout for each ping in ms
   */
  private static async pingSubnet(
    ip: string,
    netmask: string,
    timeout: number,
  ) {
    const ips = this.calculateSubnet(ip, netmask);
    const BATCH_SIZE = 50;
    let batch: Promise<void>[] = [];
    let count = 0;

    for (const targetIp of ips) {
      count++;
      if (count % 50 === 0) {
        console.log(`[Ping] Pinging ${count} IPs so far...`);
      }
      const pingCmd = Deno.build.os === "windows"
        ? ["ping", "-n", "1", "-w", timeout.toString(), targetIp]
        : [
          "ping",
          "-c",
          "1",
          "-W",
          Math.ceil(timeout / 1000).toString(),
          targetIp,
        ];

      batch.push(
        new Deno.Command(pingCmd[0], {
          args: pingCmd.slice(1),
          stdout: "null",
          stderr: "null",
        }).output()
          .then(() => {})
          .catch(() => {}),
      );

      if (batch.length >= BATCH_SIZE) {
        await Promise.all(batch);
        batch = [];
      }
    }
    if (batch.length > 0) await Promise.all(batch);
    console.log(`[Ping] Finished pinging ${count} IPs.`);
  }

  /**
   * Reads and parses the system ARP cache.
   * @returns Promise resolving to a map of IP to MAC address
   */
  private static async getArpCache(): Promise<Map<string, string>> {
    try {
      const process = new Deno.Command("arp", { args: ["-a"] });
      const { stdout } = await process.output();
      console.log("[ARP] Successfully ran 'arp -a'.");
      return this.parseArpOutput(new TextDecoder().decode(stdout));
    } catch (error) {
      console.error("[ARP] ARP command failed:", error);
      return new Map();
    }
  }

  /**
   * Parses ARP output from Windows and Unix systems.
   * @param output - Raw output from 'arp -a'
   * @returns Map of IP to MAC address
   */
  private static parseArpOutput(output: string): Map<string, string> {
    const arpMap = new Map<string, string>();
    const winRegex = /^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:-]{17})/gm;
    const unixRegex = /^(\d+\.\d+\.\d+\.\d+)\s+ether\s+([0-9a-fA-F:]{17})/gm;

    let match;
    let winCount = 0, unixCount = 0;
    while ((match = winRegex.exec(output)) !== null) {
      const ip = match[1];
      const mac = match[2].replace(/-/g, ":").toUpperCase();
      if (mac !== "00:00:00:00:00:00") {
        arpMap.set(ip, mac);
        winCount++;
      }
    }
    while ((match = unixRegex.exec(output)) !== null) {
      const ip = match[1];
      const mac = match[2].toUpperCase();
      if (mac !== "00:00:00:00:00:00") {
        arpMap.set(ip, mac);
        unixCount++;
      }
    }
    console.log(
      `[ARP] Parsed ${winCount} Windows and ${unixCount} Unix ARP entries.`,
    );
    return arpMap;
  }

  /**
   * Filters ARP entries to only those within the provided subnet.
   * @param arpCache - Map of IP to MAC address
   * @param networkIp - Subnet base IP
   * @param netmask - Subnet mask
   * @returns Array of objects with ip and mac
   */
  private static filterSubnetDevices(
    arpCache: Map<string, string>,
    networkIp: string,
    netmask: string,
  ): Array<{ ip: string; mac: string }> {
    const network = this.ipToNumber(networkIp);
    const mask = this.ipToNumber(netmask);

    const filtered = Array.from(arpCache.entries())
      .filter(([ip]) => {
        const ipNum = this.ipToNumber(ip);
        return (ipNum & mask) === (network & mask);
      })
      .map(([ip, mac]) => ({ ip, mac }));
    console.log(
      `[Subnet] Filtered ${filtered.length} devices in subnet ${networkIp}/${netmask}.`,
    );
    return filtered;
  }

  /**
   * Converts an IPv4 address string to a number.
   * @param ip - IPv4 address as string
   * @returns Numeric representation
   */
  private static ipToNumber(ip: string): number {
    return ip.split(".").reduce(
      (acc, octet) => (acc << 8) | parseInt(octet),
      0,
    );
  }

  /**
   * Enriches devices with vendor and name information.
   * @param devices - Array of ip/mac pairs
   * @param interfaceName - Name of the interface
   * @returns Array of enriched NetworkDevice objects
   */
  private static async enrichDevices(
    devices: Array<{ ip: string; mac: string }>,
    interfaceName: string,
  ): Promise<NetworkDevice[]> {
    const results: NetworkDevice[] = [];
    let idx = 0;
    for (const { ip, mac } of devices) {
      idx++;
      let name = "Unknown";

      // Try name resolution methods in priority order
      name = await this.getDeviceName(ip) ||
        await this.resolveMdnsName(ip) ||
        await this.resolveNetbiosName(ip) ||
        await this.resolveDnsName(ip);

      // Normalize MAC and get vendor
      const cleanMac = mac.replace(/:/g, "").toUpperCase();
      const oui = cleanMac.slice(0, 6);
      const vendor = this.ouiDatabase?.[oui] || "Unknown";

      console.log(
        `[Enrich] [${String(idx).padStart(2)}] ` +
          `${ip.padEnd(15)} | ` +
          `MAC: ${mac.padEnd(17)} | ` +
          `OUI: ${oui.padEnd(6)} | ` +
          `Vendor: ${vendor.padEnd(30)} | ` +
          `Name: ${name.padEnd(25)}`,
      );

      results.push({
        ip,
        mac: this.formatMac(cleanMac),
        interface: interfaceName,
        vendor: vendor,
        name: name.replace(/\s+/g, " ").trim(),
      });
    }

    return results;
  }

  /**
   * Formats a MAC address string as colon-separated uppercase.
   * @param mac - MAC address as string (no separators)
   * @returns Colon-separated MAC address
   */
  private static formatMac(mac: string): string {
    return mac.match(/.{1,2}/g)?.join(":") || mac;
  }

  /**
   * Attempts a DNS PTR (reverse lookup) for the given IP.
   * @param ip - IPv4 address
   * @returns Hostname or "Unknown"
   */
  private static async resolveDnsName(ip: string): Promise<string> {
    try {
      const records = await Deno.resolveDns(
        `${ip.split(".").reverse().join(".")}.in-addr.arpa`,
        "PTR",
      );
      const name = records[0]?.replace(/\.$/, "") || "Unknown";
      console.log(`[DNS] PTR for ${ip}: ${name}`);
      return name;
    } catch (e) {
      console.warn(`[DNS] PTR lookup failed for ${ip}: ${e}`);
      return "Unknown";
    }
  }

  /**
   * Attempts mDNS (Bonjour) name resolution for the given IP.
   * @param ip - IPv4 address
   * @returns Hostname or "Unknown"
   */
  private static async resolveMdnsName(ip: string): Promise<string> {
    try {
      const process = new Deno.Command("avahi-resolve-address", {
        args: ["-4", ip],
        stdout: "piped",
        stderr: "piped",
      });
      const { stdout } = await process.output();
      const name = new TextDecoder().decode(stdout).split("\t")[1]?.trim() ||
        "Unknown";
      console.log(`[mDNS] mDNS name for ${ip}: ${name}`);
      return name;
    } catch (e) {
      console.warn(`[mDNS] mDNS lookup failed for ${ip}: ${e}`);
      return "Unknown";
    }
  }

  /**
   * Attempts NetBIOS name resolution for the given IP (Windows only).
   * @param ip - IPv4 address
   * @returns Hostname or "Unknown"
   */
  private static async resolveNetbiosName(ip: string): Promise<string> {
    try {
      const process = new Deno.Command("nbtstat", {
        args: ["-A", ip],
        stdout: "piped",
        stderr: "piped",
      });
      const { stdout } = await process.output();
      const output = new TextDecoder().decode(stdout);
      const match = output.match(/<00>\s+UNIQUE\s+([^\s]+)/);
      const name = match?.[1] || "Unknown";
      console.log(`[NetBIOS] NetBIOS name for ${ip}: ${name}`);
      return name;
    } catch (e) {
      console.warn(`[NetBIOS] NetBIOS lookup failed for ${ip}: ${e}`);
      return "Unknown";
    }
  }

  /**
   * Attempts to retrieve device name via DHCP leases or UPnP.
   * @param ip - IPv4 address
   * @returns Device name or "Unknown"
   */
  private static async getDeviceName(ip: string): Promise<string> {
    // Try DHCP hostname first (works for routers and some devices)
    try {
      const dhcpLeases = await Deno.readTextFile(
        "/var/lib/dhcp/dhclient.leases",
      ); // Linux path
      const match = new RegExp(
        `lease ${ip} {[^}]*client-hostname "([^"]+)"`,
        "s",
      ).exec(dhcpLeases);
      if (match?.[1]) return match[1];
    } catch {} // Ignore errors

    // Try UPnP discovery as fallback
    try {
      const response = await fetch(`http://${ip}:1900/description.xml`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) {
        const text = await response.text();
        const match = text.match(/<friendlyName>([^<]+)<\/friendlyName>/i);
        if (match?.[1]) return match[1];
      }
    } catch {} // Ignore errors

    return "Unknown";
  }
}
