/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const menuItems = [
        {
            label: "📊 Server Dashboard",
            script: "dashboard.js",
            threads: 1
        },
        {
            label: "💰 Zero-RAM Targets",
            script: "zeroRamTargets.js",
            threads: 1
        },
        {
            label: "⚔️ Start Hacker",
            action: "hack"
        },
        {
            label: "🔓 Root Servers",
            script: "rootServers.js",
            threads: 1
        },
        {
            label: "📜 Coding Contracts",
            script: "contracts.js",
            threads: 1
        },
        {
            label: "🖥 Running Scripts",
            action: "processes"
        },
        {
            label: "❌ Exit",
            action: "exit"
        }
    ];

    while (true) {

        const choice = await ns.prompt(
            "BITBURNER CONTROL CENTER",
            {
                type: "select",
                choices: menuItems.map(item => item.label)
            }
        );

        if (!choice) {
            return;
        }

        const selected = menuItems.find(
            item => item.label === choice
        );

        if (!selected) {
            continue;
        }

        // =====================================================
        // EXIT
        // =====================================================

        if (selected.action === "exit") {
            return;
        }

        // =====================================================
        // RUN STANDARD SCRIPT
        // =====================================================

        if (selected.script) {

            if (!ns.fileExists(selected.script, "home")) {

                await ns.alert(
                    `Script not found:\n\n${selected.script}`
                );

                continue;
            }

            const pid = ns.run(
                selected.script,
                selected.threads
            );

            if (pid === 0) {

                await ns.alert(
                    `Could not start:\n\n${selected.script}\n\n` +
                    `Check available RAM on home.`
                );

            } else {

                ns.toast(
                    `Started ${selected.script}`,
                    "success",
                    3000
                );
            }

            continue;
        }

        // =====================================================
        // HACK TARGET MENU
        // =====================================================

        if (selected.action === "hack") {

            await launchHackMenu(ns);

            continue;
        }

        // =====================================================
        // RUNNING PROCESSES
        // =====================================================

        if (selected.action === "processes") {

            await showRunningScripts(ns);

            continue;
        }
    }
}


// =============================================================
// HACK TARGET MENU
// =============================================================

async function launchHackMenu(ns) {

    const servers = scanNetwork(ns);

    const playerHackLevel =
        ns.getHackingLevel();

    const targets = [];

    for (const server of servers) {

        if (server === "home") {
            continue;
        }

        const data =
            ns.getServer(server);

        if (!data.hasAdminRights) {
            continue;
        }

        if ((data.moneyMax ?? 0) <= 0) {
            continue;
        }

        if (
            (data.requiredHackingSkill ?? 0) >
            playerHackLevel
        ) {
            continue;
        }

        targets.push({
            server: server,

            money:
                data.moneyAvailable ?? 0,

            maxMoney:
                data.moneyMax ?? 0,

            security:
                data.hackDifficulty ?? 0,

            minSecurity:
                data.minDifficulty ?? 0
        });
    }

    // Highest max-money servers first
    targets.sort(
        (a, b) =>
            b.maxMoney - a.maxMoney
    );

    if (targets.length === 0) {

        await ns.alert(
            "No hackable money servers found."
        );

        return;
    }

    const choices =
        targets.map(target => {

            const moneyPercent =
                target.maxMoney > 0
                    ? (
                        target.money /
                        target.maxMoney
                    ) * 100
                    : 0;

            return (
                `${target.server} | ` +
                `${ns.format.number(
                    target.maxMoney,
                    2
                )} | ` +
                `${moneyPercent.toFixed(0)}%`
            );
        });

    choices.push("← Cancel");

    const choice = await ns.prompt(
        "SELECT HACK TARGET",
        {
            type: "select",
            choices: choices
        }
    );

    if (
        !choice ||
        choice === "← Cancel"
    ) {
        return;
    }

    const target =
        choice.split(" | ")[0];

    // =========================================================
    // CHOOSE HACK SCRIPT
    //
    // Change this filename if your main hacker script
    // uses a different name.
    // =========================================================

    const hackerScript =
        "hack.js";

    if (
        !ns.fileExists(
            hackerScript,
            "home"
        )
    ) {

        await ns.alert(
            `Hack script not found:\n\n${hackerScript}`
        );

        return;
    }

    // =========================================================
    // THREAD COUNT
    // =========================================================

    const requestedThreads =
        await ns.prompt(
            `Threads for ${target}`,
            {
                type: "text"
            }
        );

    if (!requestedThreads) {
        return;
    }

    const threads =
        Number(requestedThreads);

    if (
        !Number.isInteger(threads) ||
        threads <= 0
    ) {

        await ns.alert(
            "Threads must be a positive whole number."
        );

        return;
    }

    // =========================================================
    // RAM CHECK
    // =========================================================

    const scriptRam =
        ns.getScriptRam(
            hackerScript,
            "home"
        );

    const maxRam =
        ns.getServerMaxRam(
            "home"
        );

    const usedRam =
        ns.getServerUsedRam(
            "home"
        );

    const availableRam =
        maxRam - usedRam;

    const requiredRam =
        scriptRam * threads;

    if (requiredRam > availableRam) {

        const maxThreads =
            Math.floor(
                availableRam /
                scriptRam
            );

        await ns.alert(
            `Not enough RAM.\n\n` +
            `Requested: ${threads} threads\n` +
            `Required RAM: ${ns.format.ram(requiredRam)}\n` +
            `Available RAM: ${ns.format.ram(availableRam)}\n` +
            `Maximum threads: ${maxThreads}`
        );

        return;
    }

    // =========================================================
    // START HACKER
    // =========================================================

    const pid =
        ns.run(
            hackerScript,
            threads,
            target
        );

    if (pid === 0) {

        await ns.alert(
            `Could not start ${hackerScript}`
        );

        return;
    }

    ns.toast(
        `Hacking ${target} with ${threads} threads`,
        "success",
        4000
    );
}


// =============================================================
// SHOW RUNNING SCRIPTS
// =============================================================

async function showRunningScripts(ns) {

    const servers =
        scanNetwork(ns);

    const lines = [];

    let totalProcesses = 0;
    let totalThreads = 0;

    for (const server of servers) {

        const processes =
            ns.ps(server);

        if (processes.length === 0) {
            continue;
        }

        lines.push("");
        lines.push(
            `===== ${server} =====`
        );

        for (const process of processes) {

            totalProcesses++;
            totalThreads +=
                process.threads;

            let args = "";

            if (
                process.args &&
                process.args.length > 0
            ) {

                args =
                    " " +
                    process.args.join(" ");
            }

            lines.push(
                `${process.filename}` +
                ` | T:${process.threads}` +
                ` | PID:${process.pid}` +
                args
            );
        }
    }

    const header =
        `RUNNING SCRIPTS\n\n` +
        `Processes: ${totalProcesses}\n` +
        `Threads: ${totalThreads}\n`;

    if (lines.length === 0) {

        await ns.alert(
            header +
            "\nNo scripts are currently running."
        );

        return;
    }

    await ns.alert(
        header +
        lines.join("\n")
    );
}


// =============================================================
// NETWORK SCANNER
// =============================================================

function scanNetwork(ns) {

    const visited =
        new Set();

    const servers = [];

    function scan(server) {

        if (
            visited.has(server)
        ) {
            return;
        }

        visited.add(server);
        servers.push(server);

        for (
            const neighbor
            of ns.scan(server)
        ) {
            scan(neighbor);
        }
    }

    scan("home");

    return servers;
}