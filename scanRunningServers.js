/** @param {NS} ns */
export async function main(ns) {
    const visited = new Set();
    const servers = [];

    function scanServer(server) {
        if (visited.has(server)) return;

        visited.add(server);
        servers.push(server);

        for (const neighbor of ns.scan(server)) {
            scanServer(neighbor);
        }
    }

    scanServer("home");

    ns.tprint("");
    ns.tprint(
        "SERVER".padEnd(22) +
        "SCRIPTS".padStart(8) +
        "  SECURITY".padStart(12) +
        "  MIN_SEC".padStart(10) +
        "  MONEY_AVAIL".padStart(16) +
        "  MAX_MONEY".padStart(16) +
        "  THRES_MONEY".padStart(16)
    );

    ns.tprint("-".repeat(100));

    for (const server of servers) {

        // Skip home because its "money" is the player's money
        if (server === "home") continue;

        const processes = ns.ps(server);

        // Only show servers that currently have scripts running
        if (processes.length === 0) continue;

        const security = ns.getServerSecurityLevel(server);
        const minSecurity = ns.getServerMinSecurityLevel(server);
        const money = ns.getServerMoneyAvailable(server);
        const maxMoney = ns.getServerMaxMoney(server);

        ns.tprint(
            server.padEnd(22) +
            processes.length.toString().padStart(8) +
            security.toFixed(2).padStart(12) +
            minSecurity.toFixed(2).padStart(10) +
            ns.format.number(money, 2).padStart(16) +
            ns.format.number(maxMoney, 2).padStart(16) +
             ns.format.number(maxMoney*.05, 2).padStart(16)
        );
    }
}