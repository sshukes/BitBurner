/** @param {NS} ns */
export async function main(ns) {

    ns.disableLog("ALL");

    // ============================================================
    // TARGET
    // ============================================================

    const target =
        String(ns.args[0] ?? "");

    if (!target) {
        ns.tprint("ERROR: No target supplied.");
        return;
    }

    if (!ns.serverExists(target)) {
        ns.tprint(`ERROR: Server '${target}' does not exist.`);
        return;
    }

    // ============================================================
    // TARGET SETTINGS
    // ============================================================

    const maxMoney =
        ns.getServerMaxMoney(target);

    if (maxMoney <= 0) {
        return;
    }

    const minSecurity =
        ns.getServerMinSecurityLevel(target);

    // Allow security to rise slightly before weakening
    const securityThreshold =
        minSecurity + 5;

    // Grow when server falls below 90% money
    const moneyThreshold =
        maxMoney * 0.90;

    // ============================================================
    // HGW LOOP
    // ============================================================

    while (true) {

        const security =
            ns.getServerSecurityLevel(target);

        const money =
            ns.getServerMoneyAvailable(target);

        // --------------------------------------------------------
        // WEAKEN
        // --------------------------------------------------------

        if (security > securityThreshold) {

            await ns.weaken(target);
        }

        // --------------------------------------------------------
        // GROW
        // --------------------------------------------------------

        else if (money < moneyThreshold) {

            await ns.grow(target);
        }

        // --------------------------------------------------------
        // HACK
        // --------------------------------------------------------

        else {

            await ns.hack(target);
        }
    }
}