const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const CONTRACTS_ROOT = path.join(__dirname, "..");
const MANIFEST = path.join(CONTRACTS_ROOT, "deploy.config.json");

/** What the app is told about each network the engine deploys to. */
const NETWORKS = {
  local: {
    envNetwork: "local",
    networkName: "Local Asset Hub",
    chainId: 420420421,
    substrateRpc: "ws://127.0.0.1:9955",
    evmRpc: "http://127.0.0.1:8545",
    blockExplorer: null,
    funding: "Run: dapp-factory chain up (it funds the dev deployer)",
  },
  paseo: {
    envNetwork: "paseo-asset-hub",
    networkName: "Polkadot Hub TestNet",
    chainId: 420420417,
    substrateRpc: "wss://paseo-asset-hub-next-rpc.polkadot.io",
    evmRpc: "https://eth-rpc-paseo-next.polkadot.io",
    blockExplorer: "https://blockscout-testnet.polkadot.io",
    funding: "Get tokens: https://faucet.polkadot.io/ (select Paseo)",
  },
};

/** The app-facing facts for the Hardhat network being deployed to. */
function targetNetwork() {
  return hre.network.name === "local" ? NETWORKS.local : NETWORKS.paseo;
}

function readRootEnv() {
  const envPath = path.join(CONTRACTS_ROOT, "../.env");
  return fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
}

/**
 * The `SITE.chain` this deployment serves: `local`, or the public chain the factory wrote
 * as `PUBLIC_CHAIN`.
 */
function chainKey(target) {
  if (target.envNetwork === "local") return "local";
  const match = readRootEnv().match(/^PUBLIC_CHAIN=(.+)$/m);
  const chain = match ? match[1].trim() : "";
  return chain && chain !== "local" ? chain : target.envNetwork;
}

function discoverContracts() {
  const contractsDir = path.join(CONTRACTS_ROOT, "contracts");
  if (!fs.existsSync(contractsDir)) return [];
  return fs
    .readdirSync(contractsDir)
    .filter((f) => f.endsWith(".sol") && !f.startsWith("I"))
    .map((f) => f.replace(".sol", ""));
}

function discoverFromArtifacts() {
  const artifactsDir = path.join(CONTRACTS_ROOT, "artifacts/contracts");
  if (!fs.existsSync(artifactsDir)) return [];
  return fs
    .readdirSync(artifactsDir)
    .filter((f) => f.endsWith(".sol") && fs.statSync(path.join(artifactsDir, f)).isDirectory())
    .map((f) => f.replace(".sol", ""));
}

/**
 * The deploy plan: `deploy.config.json` in order when it exists, otherwise every
 * discovered contract with no arguments.
 * @returns {{ fromManifest: boolean, entries: { name: string, args?: unknown[], proxy?: string, initializer?: string }[] }}
 */
function deployPlan() {
  if (fs.existsSync(MANIFEST)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    if (!Array.isArray(manifest.contracts) || manifest.contracts.length === 0) {
      throw new Error("deploy.config.json lists no contracts");
    }
    return { fromManifest: true, entries: manifest.contracts };
  }
  let names = discoverContracts();
  if (names.length === 0) names = discoverFromArtifacts();
  return { fromManifest: false, entries: names.map((name) => ({ name })) };
}

/** Replace each `$Name` argument with the address `Name` was deployed to. */
function resolveArgs(args, deployments) {
  return (args || []).map((arg) => {
    if (typeof arg !== "string" || !arg.startsWith("$")) return arg;
    const address = deployments[arg.slice(1)];
    if (!address) throw new Error(`${arg} names a contract that is not deployed before it`);
    return address;
  });
}

/** Every chain start is fresh, so the upgrades plugin's record of a local chain is stale. */
function forgetLocalUpgrades(chainId) {
  const record = path.join(CONTRACTS_ROOT, ".openzeppelin", `unknown-${chainId}.json`);
  if (fs.existsSync(record)) fs.rmSync(record);
}

async function deployEntry(entry, deployments) {
  const factory = await hre.ethers.getContractFactory(entry.name);
  const args = resolveArgs(entry.args, deployments);
  if (entry.proxy === "uups") {
    const proxy = await hre.upgrades.deployProxy(factory, args, {
      kind: "uups",
      initializer: entry.initializer || "initialize",
    });
    await proxy.waitForDeployment();
    const address = await proxy.getAddress();
    const implementation = await hre.upgrades.erc1967.getImplementationAddress(address);
    return { address, implementation };
  }
  if (entry.proxy) throw new Error(`${entry.name}: unknown proxy kind "${entry.proxy}"`);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return { address: await contract.getAddress() };
}

async function readAbi(name) {
  try {
    return (await hre.artifacts.readArtifact(name)).abi;
  } catch {
    return null;
  }
}

function setEnv(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(content) ? content.replace(pattern, line) : `${content}\n${line}`;
}

function deploymentSource(deployments, chainId, target) {
  const network = {
    chainId,
    chainIdHex: `0x${chainId.toString(16).toUpperCase()}`,
    networkName: target.networkName,
    rpcUrl: target.evmRpc,
    blockExplorer: target.blockExplorer,
    nativeCurrency: { decimals: 18 },
  };
  return `// Auto-generated by deploy script - DO NOT EDIT MANUALLY

export const ADDRESSES = ${JSON.stringify(deployments, null, 2)};

export const NETWORK = ${JSON.stringify(network, null, 2)};
`;
}

/** `config.js`: every recorded network's addresses, picked by `SITE.chain`. */
function configSource(deploymentsDir) {
  const chains = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => f.slice(0, -3))
    .sort();
  const names = new Set();
  for (const chain of chains) {
    const text = fs.readFileSync(path.join(deploymentsDir, `${chain}.js`), "utf8");
    const match = text.match(/export const ADDRESSES = (\{[\s\S]*?\});/);
    if (match) Object.keys(JSON.parse(match[1])).forEach((n) => names.add(n));
  }
  const ident = (chain) => `deployed_${chain.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const imports = chains
    .map((chain) => `import * as ${ident(chain)} from './deployments/${chain}.js';`)
    .join("\n");
  const table = chains.map((chain) => `  ${JSON.stringify(chain)}: ${ident(chain)},`).join("\n");
  const contracts = [...names];
  const addressExports = contracts
    .map((name) => `export const ${name.toUpperCase()}_ADDRESS = CURRENT.ADDRESSES.${name} ?? ZERO_ADDRESS;`)
    .join("\n");
  const first = contracts[0];
  return `// Auto-generated by deploy script - DO NOT EDIT MANUALLY
import { SITE } from '../site.js';
${imports}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Each network the contracts were deployed to, by \`SITE.chain\`. */
const DEPLOYMENTS = {
${table}
};

const CURRENT = DEPLOYMENTS[SITE.chain] ?? { ADDRESSES: {}, NETWORK: null };

${addressExports}

export const CONTRACT_ADDRESS = ${first ? `CURRENT.ADDRESSES.${first} ?? ZERO_ADDRESS` : "ZERO_ADDRESS"};

export const CHAIN_CONFIG = {
  network: SITE.chain,
};

export const NETWORK_CONFIG = CURRENT.NETWORK ?? {
  chainId: 0,
  chainIdHex: '0x0',
  networkName: SITE.chain,
  rpcUrl: null,
  blockExplorer: null,
  nativeCurrency: { decimals: 18 },
};

export const BLOCK_EXPLORER_URL = NETWORK_CONFIG.blockExplorer
  ? \`\${NETWORK_CONFIG.blockExplorer}/address/\${CONTRACT_ADDRESS}\`
  : null;
`;
}

async function abiSource(deployments) {
  const names = Object.keys(deployments);
  const exports = [];
  for (const name of names) {
    const abi = await readAbi(name);
    if (abi) {
      exports.push(`export const ${name.toUpperCase()}_ABI = ${JSON.stringify(abi, null, 2)};`);
    } else {
      console.warn(`No artifact for ${name}; its ABI is not exported.`);
    }
  }
  if (exports.length === 0) return null;
  return `// Auto-generated by deploy script - DO NOT EDIT MANUALLY

${exports.join("\n\n")}

export const CONTRACT_ABI = ${names[0].toUpperCase()}_ABI;
`;
}

function writeRootEnv(deployments, target) {
  const envPath = path.join(CONTRACTS_ROOT, "../.env");
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const names = Object.keys(deployments);
  for (const name of names) {
    env = setEnv(env, `VITE_${name.toUpperCase()}_ADDRESS`, deployments[name]);
  }
  env = setEnv(env, "VITE_CONTRACT_ADDRESS", deployments[names[0]]);
  env = setEnv(env, "VITE_NETWORK", target.envNetwork);
  env = setEnv(env, "VITE_CHAIN_ID", String(target.chainId));
  env = setEnv(env, "VITE_RPC_URL", target.substrateRpc);
  fs.writeFileSync(envPath, env.trim() + "\n");
}

async function main() {
  const target = targetNetwork();
  if (!process.env.PRIVATE_KEY) {
    console.error("PRIVATE_KEY is not set; the engine passes it when it deploys.");
    process.exit(1);
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatUnits(balance, 18));
  if (balance === 0n) {
    console.error("The deployer has no balance.");
    console.error(target.funding);
    process.exit(1);
  }

  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  if (hre.network.name === "local") forgetLocalUpgrades(chainId);

  const plan = deployPlan();
  if (plan.entries.length === 0) {
    console.error("No contracts found in contracts/ or artifacts/; compile first.");
    process.exit(1);
  }
  console.log(`Deploying ${plan.entries.map((e) => e.name).join(", ")}`);

  const deployments = {};
  const implementations = {};
  for (const entry of plan.entries) {
    console.log(`\nDeploying ${entry.name}${entry.proxy ? ` behind a ${entry.proxy} proxy` : ""}...`);
    try {
      const deployed = await deployEntry(entry, deployments);
      deployments[entry.name] = deployed.address;
      if (deployed.implementation) implementations[entry.name] = deployed.implementation;
      console.log(`${entry.name} deployed to: ${deployed.address}`);
      if (deployed.implementation) console.log(`${entry.name} implementation: ${deployed.implementation}`);
    } catch (error) {
      console.error(`Failed to deploy ${entry.name}:`, error.message);
      if (plan.fromManifest) throw error;
    }
  }
  if (Object.keys(deployments).length === 0) {
    console.error("No contracts were deployed.");
    process.exit(1);
  }

  const deploymentsDir = path.join(CONTRACTS_ROOT, "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, "latest.json"),
    JSON.stringify(
      {
        network: hre.network.name,
        chainId: String(chainId),
        contracts: deployments,
        implementations,
        deployer: deployer.address,
        deploymentTime: new Date().toISOString(),
        blockNumber: await hre.ethers.provider.getBlockNumber(),
      },
      null,
      2,
    ),
  );

  const frontendDir = path.join(CONTRACTS_ROOT, "../src/lib/contracts");
  fs.mkdirSync(frontendDir, { recursive: true });
  const frontendDeployments = path.join(frontendDir, "deployments");
  fs.mkdirSync(frontendDeployments, { recursive: true });
  fs.writeFileSync(
    path.join(frontendDeployments, `${chainKey(target)}.js`),
    deploymentSource(deployments, chainId, target),
  );
  fs.writeFileSync(path.join(frontendDir, "config.js"), configSource(frontendDeployments));
  const abi = await abiSource(deployments);
  if (abi) fs.writeFileSync(path.join(frontendDir, "abi.js"), abi);
  writeRootEnv(deployments, target);

  if (target.blockExplorer) {
    for (const [name, address] of Object.entries(deployments)) {
      console.log(`${name}: ${target.blockExplorer}/address/${address}`);
    }
  }
  console.log("\n=== Deployment complete ===");
  console.log("Contracts:", JSON.stringify(deployments, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
