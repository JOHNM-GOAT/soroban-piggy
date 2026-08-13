import {
  rpc,
  scValToNative,
  Address,
  Contract,
  TransactionBuilder,
  Account,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { isConnected, requestAccess, getAddress, signTransaction } from "@stellar/freighter-api";
import { STELLAR_CONFIG } from "../config/stellar";

export interface VaultInfo {
  owner: string;
  unlockTime: number;
  token: string;
  balanceStroops: string;
  balanceXlm: number;
  isUnlocked: boolean;
}

const server = new rpc.Server(STELLAR_CONFIG.rpcUrl);

// Dummy account for read-only RPC simulations
const DUMMY_ACCOUNT = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");

/**
 * Check if Freighter wallet is installed in browser
 */
export async function isFreighterInstalled(): Promise<boolean> {
  if (typeof window !== "undefined" && (window as any).freighterApi) {
    return true;
  }
  try {
    const conn = await isConnected();
    if (typeof conn === "boolean") return conn;
    if (conn && typeof conn === "object" && "isConnected" in conn) {
      return Boolean((conn as any).isConnected);
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Check if Freighter wallet is already connected and returns address
 */
export async function checkWalletConnection(): Promise<{ connected: boolean; publicKey?: string }> {
  try {
    if (typeof window !== "undefined" && (window as any).freighterApi) {
      const fApi = (window as any).freighterApi;
      const addrRes = await fApi.getAddress();
      const addr = typeof addrRes === "string" ? addrRes : addrRes?.address;
      if (addr) return { connected: true, publicKey: addr };
    }

    const res = await getAddress();
    const addr = typeof res === "string" ? res : (res as any)?.address;
    if (addr) {
      return { connected: true, publicKey: addr };
    }
    return { connected: false };
  } catch (error) {
    console.error("Error checking wallet:", error);
    return { connected: false };
  }
}

/**
 * Prompt user to connect Freighter wallet with resilient fallbacks
 */
export async function connectWallet(): Promise<{ address: string | null; error?: string }> {
  try {
    // 1. Try window.freighterApi directly if injected
    if (typeof window !== "undefined" && (window as any).freighterApi) {
      const fApi = (window as any).freighterApi;
      
      let access = await fApi.requestAccess();
      let addr = typeof access === "string" ? access : access?.address;
      if (addr) return { address: addr };

      let getAddr = await fApi.getAddress();
      addr = typeof getAddr === "string" ? getAddr : getAddr?.address;
      if (addr) return { address: addr };
    }

    // 2. Try @stellar/freighter-api package export
    const access = await requestAccess();
    let addr = typeof access === "string" ? access : (access as any)?.address;
    if (addr) return { address: addr };

    const getAddr = await getAddress();
    addr = typeof getAddr === "string" ? getAddr : (getAddr as any)?.address;
    if (addr) return { address: addr };

    return {
      address: null,
      error: "Freighter extension is not installed or access was denied.",
    };
  } catch (error: any) {
    console.error("Error connecting wallet:", error);
    return {
      address: null,
      error: error?.message || "Could not connect to Freighter wallet.",
    };
  }
}

/**
 * Fetch Vault Info from Soroban RPC
 */
export async function getVaultInfo(contractId: string = STELLAR_CONFIG.contractId): Promise<VaultInfo | null> {
  try {
    const contract = new Contract(contractId);
    const op = contract.call("get_info");

    const tx = new TransactionBuilder(DUMMY_ACCOUNT, {
      fee: "100",
      networkPassphrase: STELLAR_CONFIG.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
      const retval = sim.result.retval;
      const nativeVal = scValToNative(retval);

      const balanceStroops = nativeVal.balance ? nativeVal.balance.toString() : "0";
      const balanceXlm = parseFloat(balanceStroops) / 10_000_000;

      return {
        owner: nativeVal.owner || "",
        unlockTime: Number(nativeVal.unlock_time || 0),
        token: nativeVal.token || "",
        balanceStroops,
        balanceXlm,
        isUnlocked: Boolean(nativeVal.is_unlocked),
      };
    }
    return null;
  } catch (error) {
    console.error("Error fetching vault info:", error);
    return null;
  }
}

/**
 * Build & Submit Deposit Transaction via Freighter
 */
export async function depositXlm(
  fromAddress: string,
  amountXlm: number,
  contractId: string = STELLAR_CONFIG.contractId
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const contract = new Contract(contractId);
    const amountStroops = BigInt(Math.floor(amountXlm * 10_000_000));

    const accountObj = await server.getAccount(fromAddress);

    const op = contract.call(
      "deposit",
      Address.fromString(fromAddress).toScVal(),
      nativeToScVal(amountStroops, { type: "i128" })
    );

    let tx = new TransactionBuilder(accountObj, {
      fee: "100",
      networkPassphrase: STELLAR_CONFIG.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    tx = await server.prepareTransaction(tx);

    let signResult;
    if (typeof window !== "undefined" && (window as any).freighterApi) {
      signResult = await (window as any).freighterApi.signTransaction(tx.toXDR(), {
        networkPassphrase: STELLAR_CONFIG.networkPassphrase,
      });
    } else {
      signResult = await signTransaction(tx.toXDR(), {
        networkPassphrase: STELLAR_CONFIG.networkPassphrase,
      });
    }

    const signedXdr = typeof signResult === "string" ? signResult : signResult?.signedTxXdr;

    if (!signedXdr) {
      return { success: false, error: "Transaction signing was canceled in Freighter." };
    }

    const signedTx = TransactionBuilder.fromXDR(signedXdr, STELLAR_CONFIG.networkPassphrase);
    const sendResp = await server.sendTransaction(signedTx);

    const statusStr = (sendResp.status as string) || "";
    if (statusStr === "PENDING" || statusStr === "SUCCESS") {
      let statusResp = await server.getTransaction(sendResp.hash);
      let attempts = 0;
      while ((statusResp.status as string) === "NOT_FOUND" && attempts < 10) {
        await new Promise((r) => setTimeout(r, 1500));
        statusResp = await server.getTransaction(sendResp.hash);
        attempts++;
      }
      return { success: true, txHash: sendResp.hash };
    } else {
      return { success: false, error: "Transaction submission failed." };
    }
  } catch (err: any) {
    console.error("Deposit error:", err);
    return { success: false, error: err.message || "Failed to process deposit." };
  }
}

/**
 * Build & Submit Withdraw Transaction via Freighter
 */
export async function withdrawXlm(
  callerAddress: string,
  contractId: string = STELLAR_CONFIG.contractId
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const contract = new Contract(contractId);
    const accountObj = await server.getAccount(callerAddress);

    const op = contract.call("withdraw");

    let tx = new TransactionBuilder(accountObj, {
      fee: "100",
      networkPassphrase: STELLAR_CONFIG.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    tx = await server.prepareTransaction(tx);

    let signResult;
    if (typeof window !== "undefined" && (window as any).freighterApi) {
      signResult = await (window as any).freighterApi.signTransaction(tx.toXDR(), {
        networkPassphrase: STELLAR_CONFIG.networkPassphrase,
      });
    } else {
      signResult = await signTransaction(tx.toXDR(), {
        networkPassphrase: STELLAR_CONFIG.networkPassphrase,
      });
    }

    const signedXdr = typeof signResult === "string" ? signResult : signResult?.signedTxXdr;

    if (!signedXdr) {
      return { success: false, error: "Transaction signing rejected in Freighter." };
    }

    const signedTx = TransactionBuilder.fromXDR(signedXdr, STELLAR_CONFIG.networkPassphrase);
    const sendResp = await server.sendTransaction(signedTx);

    const statusStr = (sendResp.status as string) || "";
    if (statusStr === "PENDING" || statusStr === "SUCCESS") {
      return { success: true, txHash: sendResp.hash };
    } else {
      return { success: false, error: "Withdrawal submission failed." };
    }
  } catch (err: any) {
    console.error("Withdraw error:", err);
    return { success: false, error: err.message || "Failed to process withdrawal." };
  }
}
