/** @param {NS} ns */
export async function main(ns) {
  // Defines the "target server", which is the server
  // that we're going to hack. In this case, it's "n00dles"
  const target = ns.args[0];

  // Defines how much money a server should have before we hack it
  // In this case, it is set to the maximum amount of money.
  const moneyThresh = ns.getServerMoneyAvailable(target) * .05;

  // Defines the minimum security level the target server can
  // have. If the target's security level is higher than this,
  // we'll weaken it before doing anything else
  const securityThresh = ns.getServerMinSecurityLevel(target);

  // If we have the BruteSSH.exe program, use it to open the SSH Port
  // on the target server
  if (ns.fileExists("BruteSSH.exe", "home")) {
    ns.brutessh(target);
  }
  if (ns.fileExists("FTPCrack.exe", "home")) {
    ns.ftpcrack(target);
  }

  // Get root access to target server
  ns.nuke(target);

  // Infinite loop that continously hacks/grows/weakens the target server
  while (true) {
    ns.print("-----------");
    ns.print("securityThresh:" + securityThresh);
    ns.print("moneyThresh:" + ns.format.number(moneyThresh, 2));
    ns.print("SecurityLevel:" + ns.getServerSecurityLevel(target));
    ns.print("MoneyAvailable:" + ns.format.number(ns.getServerMoneyAvailable(target),2));
    ns.print("MaxMoney:" + ns.getServerMaxMoney(target));
    ns.print("--");
    if (ns.getServerSecurityLevel(target) > securityThresh) {
      // If the server's security level is above our threshold, weaken it
      await ns.weaken(target);
    } else if (ns.getServerMoneyAvailable(target) < moneyThresh) {
      // If the server's money is less than our threshold, grow it
      await ns.grow(target);
    } else {
      // Otherwise, hack it
      await ns.hack(target);
    }
    ns.print("--------");

  }
}