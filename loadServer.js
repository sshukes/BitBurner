/** @param {NS} ns */
export async function main(ns) {

  const newServer = ns.args[0];
  ns.print("newServer: " + newServer);
  const hackScript = "early-hack-template.js";
  const newServerRam = ns.getServerMaxRam(newServer);
  const homeRam = ns.getScriptRam(hackScript)
  const myHackLevel = ns.getHackingLevel();
  var numThreads = Math.floor(newServerRam / homeRam);

  if (ns.hasRootAccess(newServer)) {
    ns.print("Already loaded. RELOADING");
    
  }

  if (ns.getServerRequiredHackingLevel(newServer) > myHackLevel) {
    ns.print("Cannot process server: " + newServer);
    ns.exit();
  }

  ns.print("Copying hackScript");
  ns.scp(hackScript, newServer);

  if (ns.fileExists("BruteSSH.exe", "home")) {
    ns.print("Executing BruteSSH.exe");
    ns.brutessh(newServer);
  }

    if (ns.fileExists("FTPCrack.exe", "home")) {
    ns.print("Executing FTPCrack.exe");
    ns.ftpcrack(newServer);
  }
  ns.print("Executing NUKE.exe");
  ns.nuke(newServer);

  ns.print("Executing hackScript:" + numThreads)
  ns.exec(hackScript, newServer, numThreads);



}