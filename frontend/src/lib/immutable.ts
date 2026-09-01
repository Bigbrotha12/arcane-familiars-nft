import { Auth, type User } from '@imtbl/auth';
import { connectWallet, ZkEvmProvider } from '@imtbl/wallet';

const clientId = import.meta.env.VITE_IMMUTABLE_CLIENT_ID as string | undefined;

export const auth = new Auth({
  clientId: clientId || '',
  redirectUri: `${window.location.origin}/callback`,
  logoutRedirectUri: window.location.origin,
  audience: 'platform_api',
  scope: 'openid offline_access email transact',
});

let providerPromise: Promise<ZkEvmProvider> | null = null;
export function getProvider() {
  if (!providerPromise) {
    providerPromise = connectWallet({ getUser: () => auth.getUser() });
  }
  return providerPromise;
}

export function login(): Promise<User | null> {
  return auth.login();
}

export async function logout(): Promise<void> {
  providerPromise = null;
  await auth.logout();
}

export function isLoggedIn(): Promise<boolean> {
  return auth.isLoggedIn();
}

export async function getIdToken(): Promise<string | undefined> {
  return auth.getIdToken();
}

export async function getAccessToken(): Promise<string | undefined> {
  return auth.getAccessToken();
}

export function getUser(): Promise<User | null> {
  return auth.getUser();
}

export async function getWalletAddress(): Promise<string | undefined> {
  try {
    const provider = await getProvider();
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (Array.isArray(accounts) && accounts.length > 0) {
      return accounts[0] as string;
    }
  } catch (err) {
    console.error('Failed to get wallet address:', err);
  }
  return undefined;
}
