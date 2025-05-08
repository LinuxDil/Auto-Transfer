import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import chalk from "chalk";
import figlet from "figlet";
import { exit } from "process";

dotenv.config();

// Ambil semua RPC dari .env
function getRpcList() {
  const rpcList = [];
  for (let i = 1; ; i++) {
    const name = process.env[`RPC_${i}_NAME`];
    const url = process.env[`RPC_${i}_URL`];
    const token = process.env[`RPC_${i}_TOKEN`];
    if (!name || !url) break;
    rpcList.push({ name, url, token });
  }
  return rpcList;
}

// ABI ERC-20
const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// Fungsi untuk menampilkan banner (sync)
function showBanner() {
  console.clear();
  const banner = figlet.textSync("TRANSFER", {
    font: "Standard",
    horizontalLayout: "default",
    verticalLayout: "default",
  });

  // Menambahkan padding untuk memposisikan [by WIN] di tengah bawah
  const lines = banner.split("\n");
  const byWinText = "[by WIN]";
  const padding = ' '.repeat(Math.floor((lines[0].length - byWinText.length) / 2)); // Menentukan padding agar [by WIN] terpusat
  console.log(chalk.greenBright(banner));
  console.log(chalk.greenBright("========================================"));
  console.log(chalk.greenBright(`${padding}${byWinText}`));  // Menambahkan padding ke [by WIN]
  console.log(chalk.greenBright("========================================"));
}

// Input dari user
async function askQuestion(query) {
  process.stdout.write(chalk.yellow(query));
  return new Promise((resolve) => {
    process.stdin.once("data", (data) => resolve(data.toString().trim()));
  });
}

// Ambil info token
async function getTokenInfo(provider, tokenAddress) {
  const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
  const decimals = await tokenContract.decimals();
  const symbol = await tokenContract.symbol();
  return { decimals, symbol };
}

// Fungsi utama transfer
async function autoTransfer(selectedRpc) {
  const receiverFile = "addresspenerima.txt";
  const senderFile = "walletpengirim.txt";

  if (!fs.existsSync(receiverFile) || !fs.existsSync(senderFile)) {
    console.log(chalk.red(`❌ File '${receiverFile}' atau '${senderFile}' tidak ditemukan.`));
    exit(1);
  }

  const recipients = fs.readFileSync(receiverFile, "utf8").split("\n").map(p => p.trim()).filter(p => p.length > 0);
  const privateKeys = fs.readFileSync(senderFile, "utf8").split("\n").map(p => p.trim()).filter(p => p.length > 0);
  const provider = new ethers.JsonRpcProvider(selectedRpc.url);
  const tokenAddress = selectedRpc.token;

  const mode = await askQuestion("Pilih mode transfer! (1 = native, 2 = ERC-20): ");
  if (!["1", "2"].includes(mode)) {
    console.log(chalk.red("❌ Pilihan tidak valid!"));
    exit(1);
  }

  const transferAll = await askQuestion("Transfer semua saldo? (y/n): ");
  const amountInput = transferAll.toLowerCase() === "y"
    ? "ALL"
    : await askQuestion("Masukkan jumlah yang akan dikirim (contoh: 0.005): ");

  console.log(chalk.yellow(`\n🚀 Chain: ${selectedRpc.name} | Mode: ${mode === "1" ? "Native" : "ERC-20"} | Jumlah: ${amountInput}\n`));

  let tokenInfo;
  if (mode === "2") {
    tokenInfo = await getTokenInfo(provider, tokenAddress);
  }

  for (let i = 0; i < privateKeys.length; i++) {
    console.log(chalk.cyanBright(`👩‍💻 [${i + 1}] Memproses wallet ke-${i + 1}...`));
    let senderWallet;
    try {
      senderWallet = new ethers.Wallet(privateKeys[i], provider);
    } catch (error) {
      console.log(chalk.red(`❌ Gagal inisialisasi wallet: ${error.message}`));
      continue;
    }

    if (mode === "2") {
      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, senderWallet);
      try {
        const balance = await tokenContract.balanceOf(senderWallet.address);
        console.log(chalk.greenBright(`✅ Saldo token: ${ethers.formatUnits(balance, tokenInfo.decimals)} ${tokenInfo.symbol}`));
        let rawAmount = amountInput === "ALL" ? balance : ethers.parseUnits(amountInput, tokenInfo.decimals);

        if (balance < rawAmount) {
          console.log(chalk.red("❌ Saldo tidak cukup."));
          continue;
        }

        for (const [j, recipient] of recipients.entries()) {
          try {
            const tx = await tokenContract.transfer(recipient, rawAmount);
            console.log(chalk.green(`✅ (${j + 1}) TX Hash: ${tx.hash}`));
            await tx.wait();
          } catch (err) {
            console.log(chalk.red(`❌ Gagal transfer ke ${recipient}: ${err.message}`));
          }
          await new Promise(r => setTimeout(r, 3000));
        }

      } catch (err) {
        console.log(chalk.red(`❌ Gagal memproses token: ${err.message}`));
      }

    } else {
      try {
        const balance = await provider.getBalance(senderWallet.address);
        console.log(chalk.greenBright(`✅ Saldo native: ${ethers.formatEther(balance)}`));
        let rawAmount = amountInput === "ALL" ? balance : ethers.parseEther(amountInput);

        if (balance < rawAmount) {
          console.log(chalk.red("❌ Saldo tidak cukup."));
          continue;
        }

        for (const [j, recipient] of recipients.entries()) {
          try {
            const tx = await senderWallet.sendTransaction({ to: recipient, value: rawAmount });
            console.log(chalk.green(`✅ (${j + 1}) TX Hash: ${tx.hash}`));
            await tx.wait();
          } catch (err) {
            console.log(chalk.red(`❌ Gagal kirim ke ${recipient}: ${err.message}`));
          }
          await new Promise(r => setTimeout(r, 3000));
        }

      } catch (err) {
        console.log(chalk.red(`❌ Gagal kirim native: ${err.message}`));
      }
    }
  }

  console.log(chalk.greenBright("\n🎉 Semua akun telah diproses!\n"));
}

// Fungsi start
async function start() {
  showBanner();
  const rpcList = getRpcList();

  if (rpcList.length === 0) {
    console.log(chalk.red("❌ Tidak ada RPC ditemukan di .env"));
    exit(1);
  }

  console.log("Daftar Chain Mainnet/Testnet:");
  rpcList.forEach((rpc, index) => {
    console.log(`${index + 1}. ${rpc.name}`);
  });

  const selectedIndex = await askQuestion("Pilih CHAIN (nomor): ");
  const selectedRpc = rpcList[Number(selectedIndex) - 1];

  if (!selectedRpc) {
    console.log(chalk.red("❌ Pilihan tidak valid!"));
    exit(1);
  }

  console.log(chalk.green(`\n✅ Kamu memilih: ${selectedRpc.name}\n`));
  await autoTransfer(selectedRpc);
}

start();
