import { isAddress } from 'ethers';
import deploymentManifest from './polygonAmoyDeployment.json';

export const LOCAL_CONTRACT_STORAGE_KEY = 'anagu_polygon_amoy_contracts_v1';

export interface PolygonAmoyContractConfig {
  networkName: string;
  chainId: number;
  chainIdHex: string;
  rpcUrl: string;
  explorerUrl: string;
  anaguTokenAddress: string;
  landTitleNftAddress: string;
  registrationFeeAnagu: string;
  source: 'env' | 'manifest' | 'admin_override' | 'unconfigured';
}

interface StoredContractOverrides {
  anaguTokenAddress?: string;
  landTitleNftAddress?: string;
}

function normalizeValidAddress(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return isAddress(trimmed) ? trimmed : '';
}

function readLocalOverrides(): StoredContractOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_CONTRACT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredContractOverrides;
    return {
      anaguTokenAddress: normalizeValidAddress(parsed.anaguTokenAddress),
      landTitleNftAddress: normalizeValidAddress(parsed.landTitleNftAddress)
    };
  } catch {
    return {};
  }
}

export function saveLocalContractAddresses(params: {
  anaguTokenAddress: string;
  landTitleNftAddress: string;
}): { ok: boolean; error?: string; config?: PolygonAmoyContractConfig } {
  const tokenAddr = params.anaguTokenAddress.trim();
  const nftAddr = params.landTitleNftAddress.trim();

  if (tokenAddr && !isAddress(tokenAddr)) {
    return { ok: false, error: 'AnaguToken address must be a valid 0x... Polygon address.' };
  }
  if (nftAddr && !isAddress(nftAddr)) {
    return { ok: false, error: 'AnaguLandTitleNFT address must be a valid 0x... Polygon address.' };
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      LOCAL_CONTRACT_STORAGE_KEY,
      JSON.stringify({
        anaguTokenAddress: tokenAddr,
        landTitleNftAddress: nftAddr
      })
    );
  }

  return { ok: true, config: getContractConfig() };
}

export function clearLocalContractAddresses(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LOCAL_CONTRACT_STORAGE_KEY);
}

export function getContractConfig(): PolygonAmoyContractConfig {
  const envToken = normalizeValidAddress(import.meta.env.VITE_ANAGU_TOKEN_ADDRESS);
  const envNft = normalizeValidAddress(import.meta.env.VITE_ANAGU_LAND_TITLE_NFT_ADDRESS);
  const envRpc =
    typeof import.meta.env.VITE_POLYGON_AMOY_RPC_URL === 'string' &&
    import.meta.env.VITE_POLYGON_AMOY_RPC_URL.trim()
      ? import.meta.env.VITE_POLYGON_AMOY_RPC_URL.trim()
      : '';

  const manifestToken = normalizeValidAddress(deploymentManifest.anaguTokenAddress);
  const manifestNft = normalizeValidAddress(deploymentManifest.landTitleNftAddress);

  const overrides = readLocalOverrides();

  const anaguTokenAddress = overrides.anaguTokenAddress || envToken || manifestToken;
  const landTitleNftAddress = overrides.landTitleNftAddress || envNft || manifestNft;

  let source: PolygonAmoyContractConfig['source'] = 'unconfigured';
  if (overrides.anaguTokenAddress || overrides.landTitleNftAddress) {
    source = 'admin_override';
  } else if (envToken || envNft) {
    source = 'env';
  } else if (manifestToken || manifestNft) {
    source = 'manifest';
  }

  return {
    networkName: deploymentManifest.network || 'Polygon Amoy Testnet',
    chainId: deploymentManifest.chainId || 80002,
    chainIdHex: deploymentManifest.chainIdHex || '0x13882',
    rpcUrl: envRpc || deploymentManifest.rpcUrl || 'https://rpc-amoy.polygon.technology',
    explorerUrl: deploymentManifest.explorerUrl || 'https://amoy.polygonscan.com',
    anaguTokenAddress,
    landTitleNftAddress,
    registrationFeeAnagu: deploymentManifest.registrationFeeAnagu || '50',
    source
  };
}

export function isAnaguTokenConfigured(): boolean {
  return Boolean(getContractConfig().anaguTokenAddress);
}

export function isLandTitleNftConfigured(): boolean {
  return Boolean(getContractConfig().landTitleNftAddress);
}

export function getPolygonAmoyTxUrl(txHash: string): string {
  const base = getContractConfig().explorerUrl.replace(/\/$/, '');
  return `${base}/tx/${txHash}`;
}

export function getPolygonAmoyAddressUrl(address: string): string {
  const base = getContractConfig().explorerUrl.replace(/\/$/, '');
  return `${base}/address/${address}`;
}

export const ANAGU_TOKEN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function registrationFee() view returns (uint256)',
  'function treasury() view returns (address)',
  'function testnetFaucetEnabled() view returns (bool)',
  'function lastFaucetClaimAt(address account) view returns (uint64)',
  'function hasPaidRegistrationFee(string parcelId) view returns (bool)',
  'function getRegistrationFeeReceipt(string parcelId) view returns (tuple(address payer, uint256 amount, uint64 paidAt, bool paid))',
  'function getPurchaseEscrow(uint256 escrowId) view returns (tuple(uint256 escrowId, bytes32 parcelIdHash, address buyer, address seller, uint256 amount, uint8 status, uint64 createdAt, uint64 settledAt, bytes32 instrumentHash))',
  'function getParcelEscrowIds(string parcelId) view returns (uint256[])',
  'function totalEscrows() view returns (uint256)',
  'function claimTestnetFaucet() external',
  'function payLandRegistrationFee(string parcelId) external returns (bytes32 parcelIdHash)',
  'function openPurchaseEscrow(string parcelId, address seller, uint256 amount) external returns (uint256 escrowId)',
  'function releasePurchaseEscrow(uint256 escrowId, bytes32 instrumentHash) external',
  'function refundPurchaseEscrow(uint256 escrowId, string reason) external',
  'event LandRegistrationFeePaid(bytes32 indexed parcelIdHash, address indexed payer, address indexed treasury, uint256 amount, uint64 paidAt)',
  'event PurchaseEscrowOpened(uint256 indexed escrowId, bytes32 indexed parcelIdHash, address indexed buyer, address seller, uint256 amount, uint64 createdAt)',
  'event PurchaseEscrowReleased(uint256 indexed escrowId, bytes32 indexed parcelIdHash, address indexed seller, uint256 amount, bytes32 instrumentHash, address releasedBy, uint64 settledAt)'
] as const;

export const ANAGU_LAND_TITLE_NFT_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalMintedTitles() view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function isParcelRegistered(string parcelId) view returns (bool)',
  'function getTokenIdByParcelId(string parcelId) view returns (uint256)',
  'function isTitleRevoked(uint256 tokenId) view returns (bool)',
  'function getOracleAttestation(string parcelId) view returns (tuple(bytes32 attestationHash, uint64 attestedAt, address attestedBy, bool exists))',
  'function getTitleIssuance(uint256 tokenId) view returns (tuple(bytes32 parcelIdHash, string cadastralRef, bytes32 spatialHash, bytes32 documentHash, bytes32 oracleAttestationHash, uint64 issuedAt, address issuedBy, address initialOwner))',
  'function getTitleState(uint256 tokenId) view returns (tuple(uint8 status, uint32 transferCount, bytes32 lastInstrumentHash, uint64 lastTransferredAt))',
  'function recordOracleAttestation(string parcelId, bytes32 attestationHash) external',
  'function mintTitle(address recipient, string parcelId, string cadastralRef, bytes32 spatialHash, bytes32 documentHash) external returns (uint256 tokenId)',
  'function registryTransfer(uint256 tokenId, address newOwner, bytes32 instrumentHash) external',
  'function revokeTitle(uint256 tokenId, uint8 ground, string gazetteNumber, bytes32 reasonHash) external',
  'event OracleAttested(bytes32 indexed parcelIdHash, bytes32 indexed attestationHash, address indexed attestedBy, uint64 attestedAt)',
  'event TitleMinted(uint256 indexed tokenId, bytes32 indexed parcelIdHash, address indexed recipient, string cadastralRef, bytes32 spatialHash, bytes32 documentHash, bytes32 oracleAttestationHash, uint64 issuedAt, address issuedBy)',
  'event RegistryTransferExecuted(uint256 indexed tokenId, bytes32 indexed parcelIdHash, address indexed from, address to, bytes32 instrumentHash, uint64 transferredAt, address executedBy)',
  'event TitleRevoked(uint256 indexed tokenId, bytes32 indexed parcelIdHash, uint8 indexed ground, string gazetteNumber, bytes32 reasonHash, address ownerAtRevocation, address revokedBy, uint64 revokedAt)'
] as const;
