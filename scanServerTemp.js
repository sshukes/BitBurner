/** @param {NS} ns */
export async function main(ns) {
    const visited = new Set();
    const servers = [];
    const serverData = [];

    function scanServer(server) {
        if (visited.has(server)) return;

        visited.add(server);
        servers.push(server);

        for (const neighbor of ns.scan(server)) {
            scanServer(neighbor);
        }
    }

    scanServer("home");

    const playerHackLevel = ns.getHackingLevel();

    const portPrograms = [
        "BruteSSH.exe",
        "FTPCrack.exe",
        "relaySMTP.exe",
        "HTTPWorm.exe",
        "SQLInject.exe"
    ];

    const portsAvailable = portPrograms.filter(program =>
        ns.fileExists(program, "home")
    ).length;

    for (const server of servers) {
        if (server === "home") continue;
        if (ns.hasRootAccess(server)) continue;

        const hackLevel = ns.getServerRequiredHackingLevel(server);
        const portsNeeded = ns.getServerNumPortsRequired(server);

        serverData.push({
            server: server,
            hackLevel: hackLevel,
            portsNeeded: portsNeeded,
            maxMoney: ns.getServerMaxMoney(server),

            // NUKE requires enough opened ports
            canNuke: portsAvailable >= portsNeeded,

            // Hacking requires sufficient hacking level
            canHack: playerHackLevel >= hackLevel
        });
    }

    // Sort by required hacking level, then ports needed
    serverData.sort((a, b) => {
        if (a.hackLevel !== b.hackLevel) {
            return a.hackLevel - b.hackLevel;
        }

        return a.portsNeeded - b.portsNeeded;
    });

    ns.tprint(
        "SERVER".padEnd(22) +
        "SV HACK LVL".padStart(10) +
        "Pl HACK LVL".padStart(10) +
        "SV PRTS".padStart(8) +
        "SV PRTS AVL".padStart(11) +
        "NUKE?".padStart(8) +
        "HACK?".padStart(8) +
        "SV MAX MONEY".padStart(16)
    );

    ns.tprint("-".repeat(93));

    for (const data of serverData) {
        ns.tprint(
            data.server.padEnd(22) +
            data.hackLevel.toString().padStart(10) +
            playerHackLevel.toString().padStart(10) +
            data.portsNeeded.toString().padStart(8) +
            portsAvailable.toString().padStart(11) +
            (data.canNuke ? "YES" : "NO").padStart(8) +
            (data.canHack ? "YES" : "NO").padStart(8) +
            ns.format.number(data.maxMoney, 2).padStart(16)
        );
    }
}