/** @param {NS} ns */
export async function main(ns) {
    const target = String(ns.args[0]);
    const additionalMsec = Number(ns.args[1] ?? 0);

    await ns.grow(target, {
        additionalMsec
    });
}