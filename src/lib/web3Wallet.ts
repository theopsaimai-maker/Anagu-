export interface EIP1193RequestArgs {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

export interface EIP1193Provider {
  request: (args: EIP1193RequestArgs) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  providers?: EIP1193Provider[];
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isRabby?: boolean;
  isBraveWallet?: boolean;
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
  isPhantom?: boolean;
  isRainbow?: boolean;
  isTokenPocket?: boolean;
  isBitKeep?: boolean;
}

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

export interface DiscoveredWallet {
  id: string;
  name: string;
  icon?: string;
  rdns?: string;
  provider: EIP1193Provider;
  source: 'eip6963' | 'injected';
}

export interface ConnectedWalletResult {
  address: string;
  chainIdHex: string;
  chainIdDecimal: number;
  chainName: string;
  walletName: string;
  provider: EIP1193Provider;
}

export interface MobileWalletDeepLink {
  id: string;
  name: string;
  subtitle: string;
  href: string;
  accentClass: string;
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
    okxwallet?: EIP1193Provider;
    coinbaseWalletExtension?: EIP1193Provider;
    trustwallet?: EIP1193Provider;
    phantom?: { ethereum?: EIP1193Provider };
  }
}

const KNOWN_CHAINS: Record<number, string> = {
  1: 'Ethereum Mainnet',
  10: 'OP Mainnet',
  56: 'BNB Smart Chain',
  137: 'Polygon PoS',
  8453: 'Base',
  42161: 'Arbitrum One',
  43114: 'Avalanche C-Chain',
  11155111: 'Sepolia Testnet',
  13371: 'Anagu Besu Registry (Chain 13371)'
};

export function getChainName(chainIdHex: string): { chainIdDecimal: number; chainName: string } {
  const parsed = Number.parseInt(chainIdHex, 16);
  const chainIdDecimal = Number.isFinite(parsed) ? parsed : 1;
  return {
    chainIdDecimal,
    chainName: KNOWN_CHAINS[chainIdDecimal] || `EVM Chain #${chainIdDecimal}`
  };
}

export function inferInjectedWalletName(provider: EIP1193Provider): string {
  if (provider.isRabby) return 'Rabby Wallet';
  if (provider.isBraveWallet) return 'Brave Wallet';
  if (provider.isTrust || provider.isTrustWallet) return 'Trust Wallet';
  if (provider.isCoinbaseWallet) return 'Coinbase Wallet';
  if (provider.isOkxWallet || provider.isOKExWallet) return 'OKX Wallet';
  if (provider.isRainbow) return 'Rainbow Wallet';
  if (provider.isPhantom) return 'Phantom (EVM)';
  if (provider.isTokenPocket) return 'TokenPocket';
  if (provider.isBitKeep) return 'Bitget Wallet';
  if (provider.isMetaMask) return 'MetaMask';
  return 'Browser Web3 Wallet';
}

export function collectLegacyInjectedWallets(): DiscoveredWallet[] {
  if (typeof window === 'undefined') return [];

  const found: DiscoveredWallet[] = [];
  const seenProviders = new Set<EIP1193Provider>();

  const pushProvider = (provider: EIP1193Provider | undefined, explicitName?: string) => {
    if (!provider || typeof provider.request !== 'function' || seenProviders.has(provider)) {
      return;
    }
    seenProviders.add(provider);
    const name = explicitName || inferInjectedWalletName(provider);
    found.push({
      id: `injected-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${found.length}`,
      name,
      provider,
      source: 'injected'
    });
  };

  if (window.ethereum) {
    if (Array.isArray(window.ethereum.providers) && window.ethereum.providers.length > 0) {
      for (const p of window.ethereum.providers) {
        pushProvider(p);
      }
    }
    pushProvider(window.ethereum);
  }

  pushProvider(window.okxwallet, 'OKX Wallet');
  pushProvider(window.coinbaseWalletExtension, 'Coinbase Wallet');
  pushProvider(window.trustwallet, 'Trust Wallet');
  pushProvider(window.phantom?.ethereum, 'Phantom (EVM)');

  return found;
}

export function subscribeEip6963Wallets(
  onUpdate: (wallets: DiscoveredWallet[]) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const eip6963Map = new Map<string, DiscoveredWallet>();

  const emitMerged = () => {
    const eip6963List = Array.from(eip6963Map.values());
    const eip6963Providers = new Set(eip6963List.map((w) => w.provider));
    const legacy = collectLegacyInjectedWallets().filter((w) => !eip6963Providers.has(w.provider));
    onUpdate([...eip6963List, ...legacy]);
  };

  const handleAnnounce = (event: Event) => {
    const customEvent = event as CustomEvent<EIP6963ProviderDetail>;
    const detail = customEvent.detail;
    if (!detail?.provider || !detail?.info?.uuid) return;
    eip6963Map.set(detail.info.uuid, {
      id: detail.info.uuid,
      name: detail.info.name,
      icon: detail.info.icon,
      rdns: detail.info.rdns,
      provider: detail.provider,
      source: 'eip6963'
    });
    emitMerged();
  };

  window.addEventListener('eip6963:announceProvider', handleAnnounce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  emitMerged();

  return () => {
    window.removeEventListener('eip6963:announceProvider', handleAnnounce);
  };
}

export function discoverWalletsOnce(timeoutMs = 150): Promise<DiscoveredWallet[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve([]);
      return;
    }

    let latest: DiscoveredWallet[] = collectLegacyInjectedWallets();
    const unsubscribe = subscribeEip6963Wallets((wallets) => {
      if (wallets.length > 0) {
        latest = wallets;
      }
    });

    window.setTimeout(() => {
      unsubscribe();
      resolve(latest.length > 0 ? latest : collectLegacyInjectedWallets());
    }, timeoutMs);
  });
}

export function formatWalletError(err: unknown): string {
  const errorObj = err as { code?: number; message?: string } | undefined;
  if (errorObj?.code === 4001) {
    return 'Wallet connection or signature was cancelled in your wallet.';
  }
  if (errorObj?.code === -32002) {
    return 'A wallet prompt is already open. Check your wallet extension or mobile app to approve.';
  }
  return errorObj?.message || 'Unable to connect to your Web3 wallet.';
}

export async function connectWeb3Wallet(wallet: DiscoveredWallet): Promise<ConnectedWalletResult> {
  const accountsResult = await wallet.provider.request({
    method: 'eth_requestAccounts'
  });

  const accounts = Array.isArray(accountsResult)
    ? accountsResult.filter((item): item is string => typeof item === 'string')
    : [];

  if (accounts.length === 0) {
    throw new Error('No wallet account was authorized.');
  }

  let chainIdHex = '0x1';
  try {
    const chainResult = await wallet.provider.request({ method: 'eth_chainId' });
    if (typeof chainResult === 'string' && chainResult.startsWith('0x')) {
      chainIdHex = chainResult;
    }
  } catch {
    // Fallback to 0x1 when chain query is unsupported
  }

  const { chainIdDecimal, chainName } = getChainName(chainIdHex);
  return {
    address: accounts[0],
    chainIdHex,
    chainIdDecimal,
    chainName,
    walletName: wallet.name,
    provider: wallet.provider
  };
}

function utf8ToHex(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return (
    '0x' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

export async function signLandPurchaseIntent(params: {
  provider: EIP1193Provider;
  account: string;
  cadastralRef: string;
  title: string;
  priceUsd: number;
  sellerName: string;
}): Promise<{ signature: string; message: string }> {
  const timestamp = new Date().toISOString();
  const message = [
    'ANAGU STATUTORY LAND MARKETPLACE — PURCHASE AUTHORIZATION',
    `Parcel Title: ${params.title}`,
    `Cadastral Ref: ${params.cadastralRef}`,
    `Asking Price: $${params.priceUsd.toLocaleString('en-US')} USD`,
    `Seller: ${params.sellerName}`,
    `Buyer Wallet: ${params.account}`,
    `Timestamp: ${timestamp}`
  ].join('\n');

  const hexMessage = utf8ToHex(message);
  const sig = await params.provider.request({
    method: 'personal_sign',
    params: [hexMessage, params.account]
  });

  if (typeof sig !== 'string' || !sig.startsWith('0x')) {
    throw new Error('Wallet did not return a valid purchase signature.');
  }

  return { signature: sig, message };
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

export function truncateAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export const ETH_USD_REFERENCE_RATE = 3200;

export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

export function usdToEthString(usdAmount: number, ethPriceUsd = ETH_USD_REFERENCE_RATE): string {
  if (!Number.isFinite(usdAmount) || usdAmount <= 0 || ethPriceUsd <= 0) return '0';
  const eth = usdAmount / ethPriceUsd;
  return eth.toFixed(6).replace(/\.?0+$/, '');
}

export function ethToWeiHex(ethAmountStr: string): string {
  const cleaned = ethAmountStr.trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error('Enter a valid positive ETH payment amount.');
  }
  const [wholePart, fracPartRaw = ''] = cleaned.split('.');
  const fracPadded = (fracPartRaw + '000000000000000000').slice(0, 18);
  const wei = BigInt(wholePart) * 10n ** 18n + BigInt(fracPadded);
  if (wei <= 0n) {
    throw new Error('Payment amount must be greater than 0 ETH.');
  }
  return '0x' + wei.toString(16);
}

export async function sendPaymentToSellerWallet(params: {
  provider: EIP1193Provider;
  fromAccount: string;
  toSellerWallet: string;
  ethAmount: string;
}): Promise<{ txHash: string }> {
  const recipient = params.toSellerWallet.trim();
  if (!isValidEvmAddress(recipient)) {
    throw new Error('Seller wallet address is invalid or missing.');
  }
  const valueHex = ethToWeiHex(params.ethAmount);
  const txHash = await params.provider.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from: params.fromAccount,
        to: recipient,
        value: valueHex
      }
    ]
  });

  if (typeof txHash !== 'string' || !txHash.startsWith('0x')) {
    throw new Error('Wallet did not return a valid transaction hash.');
  }
  return { txHash };
}

export function getMobileWalletDeepLinks(targetUrl?: string): MobileWalletDeepLink[] {
  const currentUrl =
    targetUrl || (typeof window !== 'undefined' ? window.location.href : 'https://anagu.app');
  const cleanHostAndPath = currentUrl.replace(/^https?:\/\//i, '');
  const encodedUrl = encodeURIComponent(currentUrl);

  return [
    {
      id: 'metamask',
      name: 'MetaMask',
      subtitle: 'Open in MetaMask Mobile',
      href: `https://metamask.app.link/dapp/${cleanHostAndPath}`,
      accentClass: 'border-orange-500/40 bg-orange-950/30 hover:bg-orange-900/40 text-orange-200'
    },
    {
      id: 'trust',
      name: 'Trust Wallet',
      subtitle: 'Open in Trust Wallet',
      href: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodedUrl}`,
      accentClass: 'border-sky-500/40 bg-sky-950/30 hover:bg-sky-900/40 text-sky-200'
    },
    {
      id: 'coinbase',
      name: 'Coinbase Wallet',
      subtitle: 'Open in Coinbase Wallet',
      href: `https://go.cb-w.com/dapp?cb_url=${encodedUrl}`,
      accentClass: 'border-blue-500/40 bg-blue-950/30 hover:bg-blue-900/40 text-blue-200'
    },
    {
      id: 'okx',
      name: 'OKX Wallet',
      subtitle: 'Open in OKX Web3',
      href: `https://www.okx.com/download?deeplink=${encodeURIComponent(
        `okx://wallet/dapp/details?dappUrl=${currentUrl}`
      )}`,
      accentClass: 'border-slate-500/40 bg-slate-800/70 hover:bg-slate-800 text-slate-100'
    }
  ];
}
