import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import {
  initializeAccount,
  initializeMint,
  memoInstruction,
  mintTo,
  TOKEN_PROGRAM_ID,
  transfer,
} from './instructions';
import { ACCOUNT_LAYOUT, getOwnedAccountsFilters, MINT_LAYOUT } from './data';
import { ledger_sign_transaction } from '../ledger'
import bs58 from 'bs58';

export async function getOwnedTokenAccounts(connection, publicKey) {
  let filters = getOwnedAccountsFilters(publicKey);
  let resp = await connection._rpcRequest('getProgramAccounts', [
    TOKEN_PROGRAM_ID.toBase58(),
    {
      commitment: connection.commitment,
      filters,
    },
  ]);
  if (resp.error) {
    throw new Error(
      'failed to get token accounts owned by ' +
      publicKey.toBase58() +
      ': ' +
      resp.error.message,
    );
  }
  return resp.result
    .map(({ pubkey, account: { data, executable, owner, lamports } }) => ({
      publicKey: new PublicKey(pubkey),
      accountInfo: {
        data: bs58.decode(data),
        executable,
        owner: new PublicKey(owner),
        lamports,
      },
    }))
    .filter(({ accountInfo }) => {
      // TODO: remove this check once mainnet is updated
      return filters.every((filter) => {
        if (filter.dataSize) {
          return accountInfo.data.length === filter.dataSize;
        } else if (filter.memcmp) {
          let filterBytes = bs58.decode(filter.memcmp.bytes);
          return accountInfo.data
            .slice(
              filter.memcmp.offset,
              filter.memcmp.offset + filterBytes.length,
            )
            .equals(filterBytes);
        }
        return false;
      });
    });
}

export async function createAndInitializeMint({
  connection,
  owner, // Account for paying fees and allowed to mint new tokens
  mint, // Account to hold token information
  amount, // Number of tokens to issue
  decimals,
  initialAccount, // Account to hold newly issued tokens, if amount > 0
}) {
  let transaction = SystemProgram.createAccount({
    fromPubkey: owner.publicKey,
    newAccountPubkey: mint.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(
      MINT_LAYOUT.span,
    ),
    space: MINT_LAYOUT.span,
    programId: TOKEN_PROGRAM_ID,
  });
  transaction.add(
    initializeMint({
      mint: mint.publicKey,
      decimals,
      mintAuthority: owner.publicKey,
    }),
  );
  let signers = [owner, mint];
  if (amount > 0) {
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: owner.publicKey,
        newAccountPubkey: initialAccount.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(
          ACCOUNT_LAYOUT.span,
        ),
        space: ACCOUNT_LAYOUT.span,
        programId: TOKEN_PROGRAM_ID,
      }),
    );
    signers.push(initialAccount);
    transaction.add(
      initializeAccount({
        account: initialAccount.publicKey,
        mint: mint.publicKey,
        owner: owner.publicKey,
      }),
    );
    transaction.add(
      mintTo({
        mint: mint.publicKey,
        destination: initialAccount.publicKey,
        amount,
        mintAuthority: owner.publicKey,
      }),
    );
  }
  return await connection.sendTransaction(transaction, signers);
}

export async function createAndInitializeTokenAccount({
  connection,
  payer,
  mintPublicKey,
  newAccount,
}) {
  let transaction = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: newAccount.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(
      ACCOUNT_LAYOUT.span,
    ),
    space: ACCOUNT_LAYOUT.span,
    programId: TOKEN_PROGRAM_ID,
  });
  transaction.add(
    initializeAccount({
      account: newAccount.publicKey,
      mint: mintPublicKey,
      owner: payer.publicKey,
    }),
  );
  let signers = [payer, newAccount];
  return await connection.sendTransaction(transaction, signers);
}

export async function createAndInitializeTokenAccountForLedger({
  connection,
  ledgerPubKey,
  mintPublicKey,
  newAccount,
}) {
  let transaction = SystemProgram.createAccount({
    fromPubkey: ledgerPubKey,
    newAccountPubkey: newAccount.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(
      ACCOUNT_LAYOUT.span,
    ),
    space: ACCOUNT_LAYOUT.span,
    programId: TOKEN_PROGRAM_ID,
  });
  transaction.add(
    initializeAccount({
      account: newAccount.publicKey,
      mint: mintPublicKey,
      owner: ledgerPubKey,
    }),
  );
  transaction.recentBlockhash = (await connection.getRecentBlockhash('root')).blockhash;
  const sig_bytes = await ledger_sign_transaction(transaction);
  transaction.addSignature(ledgerPubKey, sig_bytes);
  transaction.addSigner(newAccount);

  return await connection.sendRawTransaction(transaction.serialize());
}

export async function transferTokens({
  connection,
  owner,
  sourcePublicKey,
  destinationPublicKey,
  amount,
  memo,
}) {
  let transaction = new Transaction().add(
    transfer({
      source: sourcePublicKey,
      destination: destinationPublicKey,
      owner: owner.publicKey,
      amount,
    }),
  );
  if (memo) {
    transaction.add(memoInstruction(memo));
  }
  let signers = [owner];
  return await connection.sendTransaction(transaction, signers);
}

export async function transferTokensFromLedger({
  connection,
  ledgerPubKey,
  sourcePublicKey,
  destinationPublicKey,
  amount,
  memo,
}) {
  console.log(111, ledgerPubKey, sourcePublicKey, destinationPublicKey, amount)
  let transaction = new Transaction().add(
    transfer({
      source: sourcePublicKey,
      destination: destinationPublicKey,
      owner: ledgerPubKey,
      amount,
    }),
  );
  console.log(112, transaction)
  if (memo) {
    transaction.add(memoInstruction(memo));
  }
  console.log(113, transaction)
  transaction.recentBlockhash = (await connection.getRecentBlockhash('root')).blockhash;
  console.log(114, transaction)
  const sig_bytes = await ledger_sign_transaction(transaction);
  console.log(115, transaction)
  transaction.addSignature(ledgerPubKey, sig_bytes);
  console.log(116, transaction)
  // let signers = [owner];
  return await connection.sendRawTransaction(transaction.serialize());
}
