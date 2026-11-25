import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  formatUnits,
  id as keccak256Utf8,
  isAddress,
  parseUnits
} from 'ethers';
import {
  ANAGU_LAND_TITLE_NFT_ABI,
  ANAGU_TOKEN_ABI,
  getContractConfig
} from '../config/contracts';
import { EIP1193Provider, ensurePolygonNetwork } from './web3Wallet';
import type { RevocationGround } from '../types/anagu';

export interface AnaguTokenStatus {
  configured: boolean;
  contractAddress: string;
  balanceFormatted: string;
  registrationFeeFormatted: string;
  testnetFaucetEnabled: boolean;
  parcelFeePaid?: boolean;
}

export interface OnChainParcelTitleStatus {
  configured: boolean;
  contractAddress: string;
  isRegistered: boolean;
  tokenId: number;
  owner: string;
  oracleAttested: boolean;
  isRevoked: boolean;
}

function normalizeBytes32(input: string, fallbackSalt: string): string {
  const cleaned = input.trim();
  if (/^0x[a-fA-F0-9]{64}$/.test(cleaned)) {
    return cleaned;
  }
  return keccak256Utf8(cleaned || fallbackSalt);
}

function parseContractError(err: unknown, fallback: string): string {
  const e = err as {
    shortMessage?: string;
    reason?: string;
    message?: string;
    code?: string | number;
  };
  if (e?.code === 4001 || e?.code === 'ACTION_REJECTED') {
    return 'Transaction was cancelled in your Polygon wallet.';
  }
  if (typeof e?.reason === 'string' && e.reason.trim()) {
    return e.reason;
  }
  if (typeof e?.shortMessage === 'string' && e.shortMessage.trim()) {
    return e.shortMessage;
  }
  if (typeof e?.message === 'string' && e.message.trim()) {
    return e.message.slice(0, 220);
  }
  return fallback;
}

async function getPolygonAmoySigner(provider: EIP1193Provider) {
  await ensurePolygonNetwork(provider, 'amoy');
  const browserProvider = new BrowserProvider(provider);
  return browserProvider.getSigner();
}

export async function readAnaguTokenStatus(
  walletAddress?: string,
  parcelId?: string,
  injectedProvider?: EIP1193Provider
): Promise<AnaguTokenStatus> {
  const cfg = getContractConfig();
  if (!cfg.anaguTokenAddress) {
    return {
      configured: false,
      contractAddress: '',
      balanceFormatted: '0',
      registrationFeeFormatted: cfg.registrationFeeAnagu || '50',
      testnetFaucetEnabled: true
    };
  }

  const reader = injectedProvider
    ? new BrowserProvider(injectedProvider)
    : new JsonRpcProvider(cfg.rpcUrl, cfg.chainId);
  const token = new Contract(cfg.anaguTokenAddress, ANAGU_TOKEN_ABI, reader);

  const [feeRaw, faucetEnabled, balanceRaw, parcelPaid] = await Promise.all([
    token.registrationFee().catch(() => parseUnits(cfg.registrationFeeAnagu || '50', 18)),
    token.testnetFaucetEnabled().catch(() => true),
    walletAddress && isAddress(walletAddress)
      ? token.balanceOf(walletAddress).catch(() => 0n)
      : Promise.resolve(0n),
    parcelId ? token.hasPaidRegistrationFee(parcelId).catch(() => false) : Promise.resolve(undefined)
  ]);

  return {
    configured: true,
    contractAddress: cfg.anaguTokenAddress,
    balanceFormatted: Number(formatUnits(balanceRaw, 18)).toLocaleString('en-US', {
      maximumFractionDigits: 2
    }),
    registrationFeeFormatted: formatUnits(feeRaw, 18).replace(/\.0+$/, ''),
    testnetFaucetEnabled: Boolean(faucetEnabled),
    parcelFeePaid: typeof parcelPaid === 'boolean' ? parcelPaid : undefined
  };
}

export async function claimTestnetAnaguTokens(
  provider: EIP1193Provider
): Promise<{ txHash: string; amountFormatted: string }> {
  const cfg = getContractConfig();
  if (!cfg.anaguTokenAddress) {
    throw new Error(
      'AnaguToken contract address is not configured yet. Deploy contracts to Polygon Amoy and save the address first.'
    );
  }

  try {
    const signer = await getPolygonAmoySigner(provider);
    const token = new Contract(cfg.anaguTokenAddress, ANAGU_TOKEN_ABI, signer);
    const tx = await token.claimTestnetFaucet();
    const receipt = await tx.wait();
    return {
      txHash: receipt?.hash || tx.hash,
      amountFormatted: '1,000'
    };
  } catch (err) {
    throw new Error(parseContractError(err, 'Unable to claim testnet ANAGU tokens.'));
  }
}

export async function payRegistrationFeeOnChain(
  provider: EIP1193Provider,
  parcelId: string
): Promise<{ txHash: string; feeFormatted: string }> {
  const cfg = getContractConfig();
  if (!cfg.anaguTokenAddress) {
    throw new Error(
      'AnaguToken contract address is not configured yet for Polygon Amoy Testnet.'
    );
  }
  const cleanParcelId = parcelId.trim();
  if (!cleanParcelId) {
    throw new Error('Parcel ID is required to pay the statutory registration fee.');
  }

  try {
    const signer = await getPolygonAmoySigner(provider);
    const token = new Contract(cfg.anaguTokenAddress, ANAGU_TOKEN_ABI, signer);
    const feeRaw: bigint = await token.registrationFee();
    const tx = await token.payLandRegistrationFee(cleanParcelId);
    const receipt = await tx.wait();
    return {
      txHash: receipt?.hash || tx.hash,
      feeFormatted: formatUnits(feeRaw, 18).replace(/\.0+$/, '')
    };
  } catch (err) {
    throw new Error(parseContractError(err, 'Statutory ANAGU registration fee payment failed.'));
  }
}

export async function openLandPurchaseEscrowOnChain(params: {
  provider: EIP1193Provider;
  parcelId: string;
  sellerWallet: string;
  anaguAmount: string;
}): Promise<{ txHash: string; escrowId: string }> {
  const cfg = getContractConfig();
  if (!cfg.anaguTokenAddress) {
    throw new Error(
      'AnaguToken contract address is not configured yet for Polygon Amoy Testnet.'
    );
  }
  if (!params.parcelId.trim()) {
    throw new Error('Parcel ID is required to open statutory purchase escrow.');
  }
  if (!isAddress(params.sellerWallet)) {
    throw new Error('Seller wallet must be a valid 0x... Polygon address for ANAGU escrow.');
  }
  const cleanedAmount = params.anaguAmount.trim();
  if (!/^\d+(\.\d+)?$/.test(cleanedAmount) || Number(cleanedAmount) <= 0) {
    throw new Error('Enter a valid positive ANAGU amount.');
  }

  try {
    const signer = await getPolygonAmoySigner(params.provider);
    const token = new Contract(cfg.anaguTokenAddress, ANAGU_TOKEN_ABI, signer);
    const amountWei = parseUnits(cleanedAmount, 18);
    const tx = await token.openPurchaseEscrow(params.parcelId.trim(), params.sellerWallet, amountWei);
    const receipt = await tx.wait();

    let escrowId = '';
    if (receipt?.logs) {
      for (const log of receipt.logs) {
        try {
          const parsed = token.interface.parseLog(log);
          if (parsed?.name === 'PurchaseEscrowOpened') {
            escrowId = parsed.args.escrowId.toString();
            break;
          }
        } catch {
          // Ignore unrelated logs
        }
      }
    }

    return {
      txHash: receipt?.hash || tx.hash,
      escrowId: escrowId || 'Confirmed'
    };
  } catch (err) {
    throw new Error(parseContractError(err, 'Opening ANAGU land purchase escrow failed.'));
  }
}

export async function releaseLandPurchaseEscrowOnChain(params: {
  provider: EIP1193Provider;
  escrowId: string;
  instrumentRef: string;
}): Promise<{ txHash: string }> {
  const cfg = getContractConfig();
  if (!cfg.anaguTokenAddress) {
    throw new Error('AnaguToken contract address is not configured.');
  }

  try {
    const signer = await getPolygonAmoySigner(params.provider);
    const token = new Contract(cfg.anaguTokenAddress, ANAGU_TOKEN_ABI, signer);
    const instrumentHash = normalizeBytes32(params.instrumentRef, `instrument:${params.escrowId}`);
    const tx = await token.releasePurchaseEscrow(BigInt(params.escrowId), instrumentHash);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  } catch (err) {
    throw new Error(parseContractError(err, 'Releasing ANAGU purchase escrow failed.'));
  }
}

export async function recordOracleAttestationOnChain(params: {
  provider: EIP1193Provider;
  parcelId: string;
  attestationSummary: string;
}): Promise<{ txHash: string; attestationHash: string }> {
  const cfg = getContractConfig();
  if (!cfg.landTitleNftAddress) {
    throw new Error('AnaguLandTitleNFT contract address is not configured on Polygon Amoy.');
  }

  try {
    const signer = await getPolygonAmoySigner(params.provider);
    const nft = new Contract(cfg.landTitleNftAddress, ANAGU_LAND_TITLE_NFT_ABI, signer);
    const attestationHash = normalizeBytes32(
      params.attestationSummary,
      `oracle:${params.parcelId}:${Date.now()}`
    );
    const tx = await nft.recordOracleAttestation(params.parcelId.trim(), attestationHash);
    const receipt = await tx.wait();
    return {
      txHash: receipt?.hash || tx.hash,
      attestationHash
    };
  } catch (err) {
    throw new Error(parseContractError(err, 'Recording Oracle attestation on Polygon Amoy failed.'));
  }
}

export async function mintLandTitleNftOnChain(params: {
  provider: EIP1193Provider;
  recipient: string;
  parcelId: string;
  cadastralRef: string;
  spatialHash: string;
  documentHash: string;
}): Promise<{ txHash: string; tokenId: number; blockNumber?: number }> {
  const cfg = getContractConfig();
  if (!cfg.landTitleNftAddress) {
    throw new Error('AnaguLandTitleNFT contract address is not configured on Polygon Amoy.');
  }
  if (!isAddress(params.recipient)) {
    throw new Error('Title recipient wallet must be a valid 0x... Polygon address.');
  }

  try {
    const signer = await getPolygonAmoySigner(params.provider);
    const nft = new Contract(cfg.landTitleNftAddress, ANAGU_LAND_TITLE_NFT_ABI, signer);
    const spatialHash = normalizeBytes32(params.spatialHash, `spatial:${params.parcelId}`);
    const documentHash = normalizeBytes32(params.documentHash, `doc:${params.parcelId}`);

    const tx = await nft.mintTitle(
      params.recipient,
      params.parcelId.trim(),
      params.cadastralRef.trim(),
      spatialHash,
      documentHash
    );
    const receipt = await tx.wait();

    let tokenId = 0;
    if (receipt?.logs) {
      for (const log of receipt.logs) {
        try {
          const parsed = nft.interface.parseLog(log);
          if (parsed?.name === 'TitleMinted') {
            tokenId = Number(parsed.args.tokenId);
            break;
          }
        } catch {
          // Ignore non-matching logs
        }
      }
    }
    if (!tokenId) {
      const queried: bigint = await nft.getTokenIdByParcelId(params.parcelId.trim());
      tokenId = Number(queried);
    }

    return {
      txHash: receipt?.hash || tx.hash,
      tokenId,
      blockNumber: receipt?.blockNumber ? Number(receipt.blockNumber) : undefined
    };
  } catch (err) {
    throw new Error(parseContractError(err, 'Minting AnaguLandTitleNFT on Polygon Amoy failed.'));
  }
}

export async function executeRegistryTransferOnChain(params: {
  provider: EIP1193Provider;
  tokenId: number;
  newOwner: string;
  instrumentRef: string;
}): Promise<{ txHash: string }> {
  const cfg = getContractConfig();
  if (!cfg.landTitleNftAddress) {
    throw new Error('AnaguLandTitleNFT contract address is not configured on Polygon Amoy.');
  }
  if (!isAddress(params.newOwner)) {
    throw new Error('New titleholder wallet must be a valid 0x... Polygon address.');
  }

  try {
    const signer = await getPolygonAmoySigner(params.provider);
    const nft = new Contract(cfg.landTitleNftAddress, ANAGU_LAND_TITLE_NFT_ABI, signer);
    const instrumentHash = normalizeBytes32(
      params.instrumentRef,
      `assignment:${params.tokenId}:${Date.now()}`
    );
    const tx = await nft.registryTransfer(BigInt(params.tokenId), params.newOwner, instrumentHash);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  } catch (err) {
    throw new Error(parseContractError(err, 'Registrar title transfer on Polygon Amoy failed.'));
  }
}

export async function revokeLandTitleOnChain(params: {
  provider: EIP1193Provider;
  tokenId: number;
  ground: RevocationGround;
  gazetteNumber: string;
  reason: string;
}): Promise<{ txHash: string }> {
  const cfg = getContractConfig();
  if (!cfg.landTitleNftAddress) {
    throw new Error('AnaguLandTitleNFT contract address is not configured on Polygon Amoy.');
  }

  try {
    const signer = await getPolygonAmoySigner(params.provider);
    const nft = new Contract(cfg.landTitleNftAddress, ANAGU_LAND_TITLE_NFT_ABI, signer);
    const groundIdx = params.ground === 'BreachOfStatutoryCondition' ? 1 : 0;
    const reasonHash = normalizeBytes32(params.reason, `revoke:${params.tokenId}`);
    const tx = await nft.revokeTitle(
      BigInt(params.tokenId),
      groundIdx,
      params.gazetteNumber.trim(),
      reasonHash
    );
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  } catch (err) {
    throw new Error(parseContractError(err, 'Revoking Land Title NFT on Polygon Amoy failed.'));
  }
}

export async function readOnChainParcelTitle(
  parcelId: string
): Promise<OnChainParcelTitleStatus> {
  const cfg = getContractConfig();
  if (!cfg.landTitleNftAddress) {
    return {
      configured: false,
      contractAddress: '',
      isRegistered: false,
      tokenId: 0,
      owner: '',
      oracleAttested: false,
      isRevoked: false
    };
  }

  const provider = new JsonRpcProvider(cfg.rpcUrl, cfg.chainId);
  const nft = new Contract(cfg.landTitleNftAddress, ANAGU_LAND_TITLE_NFT_ABI, provider);
  const [isRegistered, tokenIdBig, att] = await Promise.all([
    nft.isParcelRegistered(parcelId).catch(() => false),
    nft.getTokenIdByParcelId(parcelId).catch(() => 0n),
    nft.getOracleAttestation(parcelId).catch(() => ({ exists: false }))
  ]);

  const tokenId = Number(tokenIdBig);
  let owner = '';
  let isRevoked = false;
  if (tokenId > 0) {
    [owner, isRevoked] = await Promise.all([
      nft.ownerOf(tokenIdBig).catch(() => ''),
      nft.isTitleRevoked(tokenIdBig).catch(() => false)
    ]);
  }

  return {
    configured: true,
    contractAddress: cfg.landTitleNftAddress,
    isRegistered: Boolean(isRegistered),
    tokenId,
    owner,
    oracleAttested: Boolean(att?.exists),
    isRevoked: Boolean(isRevoked)
  };
}
