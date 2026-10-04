/** @param {NS} ns */
export async function main(ns) {

    ns.disableLog("ALL");


    // ============================================================
    // LOCAL / REMOTE TARGET HACK SCRIPT
    // ============================================================
    //
    // Usage:
    //
    // run local-hack-template.js <target>
    //
    // Example:
    //
    // run local-hack-template.js joesguns
    //
    // Purpose:
    //
    // - Run this script on a server that has RAM
    // - Hack a different remote target
    // - Useful for targets that have money but little/no RAM
    //
    // ============================================================


    // ============================================================
    // TARGET ARGUMENT
    // ============================================================

    const target =
        String(
            ns.args[0] ?? ""
        );


    if (!target) {

        ns.tprint(
            "ERROR: No target supplied."
        );

        ns.tprint(
            "Usage: run local-hack-template.js <target>"
        );

        return;
    }


    // ============================================================
    // VALIDATE TARGET
    // ============================================================

    if (
        !ns.serverExists(
            target
        )
    ) {

        ns.tprint(
            `ERROR: Server '${target}' does not exist.`
        );

        return;
    }


    const maxMoney =
        ns.getServerMaxMoney(
            target
        );


    if (
        maxMoney <= 0
    ) {

        ns.tprint(
            `ERROR: ${target} has no money available to hack.`
        );

        return;
    }


    // ============================================================
    // HACKING LEVEL CHECK
    // ============================================================

    const requiredHackLevel =
        ns.getServerRequiredHackingLevel(
            target
        );


    const playerHackLevel =
        ns.getHackingLevel();


    if (
        playerHackLevel <
        requiredHackLevel
    ) {

        ns.tprint(
            `ERROR: ${target} requires hacking level ` +
            `${requiredHackLevel}, but your level is ${playerHackLevel}.`
        );

        return;
    }


    // ============================================================
    // THRESHOLDS
    // ============================================================

    const moneyThresh =
        maxMoney *
        0.90;


    const minSecurity =
        ns.getServerMinSecurityLevel(
            target
        );


    const securityThresh =
        minSecurity +
        5;


    // ============================================================
    // PORT PROGRAMS
    // ============================================================

    const programs = [

        {
            file:
                "BruteSSH.exe",

            open:
                server =>
                    ns.brutessh(
                        server
                    )
        },

        {
            file:
                "FTPCrack.exe",

            open:
                server =>
                    ns.ftpcrack(
                        server
                    )
        },

        {
            file:
                "relaySMTP.exe",

            open:
                server =>
                    ns.relaysmtp(
                        server
                    )
        },

        {
            file:
                "HTTPWorm.exe",

            open:
                server =>
                    ns.httpworm(
                        server
                    )
        },

        {
            file:
                "SQLInject.exe",

            open:
                server =>
                    ns.sqlinject(
                        server
                    )
        }
    ];


    // ============================================================
    // ROOT TARGET IF NEEDED
    // ============================================================

    if (
        !ns.hasRootAccess(
            target
        )
    ) {

        const availablePrograms =
            programs.filter(
                program =>
                    ns.fileExists(
                        program.file,
                        "home"
                    )
            );


        const portsRequired =
            ns.getServerNumPortsRequired(
                target
            );


        if (
            availablePrograms.length <
            portsRequired
        ) {

            ns.tprint(
                `ERROR: Cannot root ${target}. ` +
                `Need ${portsRequired} ports, ` +
                `but only ${availablePrograms.length} port programs are available.`
            );

            return;
        }


        for (
            const program
            of availablePrograms
        ) {

            program.open(
                target
            );
        }


        const rooted =
            ns.nuke(
                target
            );


        if (
            !rooted ||
            !ns.hasRootAccess(
                target
            )
        ) {

            ns.tprint(
                `ERROR: Failed to gain root access on ${target}.`
            );

            return;
        }
    }


    // ============================================================
    // UI
    // ============================================================

    ns.ui.openTail();

    ns.ui.resizeTail(
        950,
        420
    );

    ns.ui.setTailTitle(
        `LOCAL HACK // ${target}`
    );


    let lastDisplay = "";


    // ============================================================
    // MAIN LOOP
    // ============================================================

    while (true) {

        const currentSecurity =
            ns.getServerSecurityLevel(
                target
            );


        const currentMoney =
            ns.getServerMoneyAvailable(
                target
            );


        const moneyPercent =
            maxMoney > 0
                ? (
                    currentMoney /
                    maxMoney
                ) *
                  100
                : 0;


        const securityDelta =
            currentSecurity -
            minSecurity;


        let action;


        // ========================================================
        // ACTION SELECTION
        // ========================================================

        if (
            currentSecurity >
            securityThresh
        ) {

            action =
                "WEAKEN";
        }
        else if (
            currentMoney <
            moneyThresh
        ) {

            action =
                "GROW";
        }
        else {

            action =
                "HACK";
        }


        // ========================================================
        // DISPLAY
        // ========================================================

        const lines = [];


        lines.push(
            "=============================================================="
        );


        lines.push(
            `LOCAL HACK // ${target}`
        );


        lines.push(
            "=============================================================="
        );


        lines.push(
            `Running From:     ${ns.getHostname()}`
        );


        lines.push(
            `Target:           ${target}`
        );


        lines.push(
            `Action:           ${action}`
        );


        lines.push("");


        lines.push(
            `Hack Level:       ${playerHackLevel}`
        );


        lines.push(
            `Required Level:   ${requiredHackLevel}`
        );


        lines.push("");


        lines.push(
            `Money:            ${ns.format.number(currentMoney, 2)}`
        );


        lines.push(
            `Max Money:        ${ns.format.number(maxMoney, 2)}`
        );


        lines.push(
            `Money %:          ${moneyPercent.toFixed(1)}%`
        );


        lines.push(
            `Hack Threshold:   ${(moneyThresh / maxMoney * 100).toFixed(0)}%`
        );


        lines.push("");


        lines.push(
            `Security:         ${currentSecurity.toFixed(2)}`
        );


        lines.push(
            `Minimum Security: ${minSecurity.toFixed(2)}`
        );


        lines.push(
            `Security Delta:   +${securityDelta.toFixed(2)}`
        );


        lines.push(
            `Security Limit:   ${securityThresh.toFixed(2)}`
        );


        lines.push(
            "=============================================================="
        );


        const display =
            lines.join(
                "\n"
            );


        if (
            display !==
            lastDisplay
        ) {

            ns.clearLog();

            ns.print(
                display
            );

            lastDisplay =
                display;
        }


        // ========================================================
        // RUN ACTION
        // ========================================================

        if (
            action === "WEAKEN"
        ) {

            await ns.weaken(
                target
            );
        }
        else if (
            action === "GROW"
        ) {

            await ns.grow(
                target
            );
        }
        else {

            await ns.hack(
                target
            );
        }
    }
}