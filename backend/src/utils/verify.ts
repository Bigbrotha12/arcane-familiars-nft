import { hashMessage } from '@ethersproject/hash';
import { recoverPublicKey } from '@ethersproject/signing-key';
import { computeAddress } from '@ethersproject/transactions';

export function verifyAuth(
  eth_address: string,
  eth_timestamp: number,
  eth_signature: string
): { verified: boolean; recoveredAddress?: string; reason?: string } {
  try {
    const message = eth_timestamp.toString();
    const messageHash = hashMessage(message);
    const publicKey = recoverPublicKey(messageHash, eth_signature);
    const recoveredAddress = computeAddress(publicKey);

    const match = recoveredAddress.toLowerCase() === eth_address.toLowerCase();

    if (!match) {
      return {
        verified: false,
        recoveredAddress,
        reason: 'Signer address does not match claimed address',
      };
    }

    return { verified: true, recoveredAddress };
  } catch (error) {
    return {
      verified: false,
      reason: `Signature verification failed: ${(error as Error).message}`,
    };
  }
}
