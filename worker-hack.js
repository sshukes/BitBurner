/** @param {NS} ns */
export async function main(ns) {
    const target = String(ns.args[0]);
    await ns.hack(target);
}
